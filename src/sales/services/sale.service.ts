import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Sale, SaleDetail, SaleStatus, DiscountType, SalePayment, PaymentStatus } from '../entities';
import { DataSource, DeepPartial, IsNull, Like, Repository } from 'typeorm';
import { CustomerService, DiscountCodeService } from '.';
import { BranchService, InventoryMovementService, ProductService } from 'src/logistics/services';
import { CreateSaleDto, PaginatedSaleResponseDto, QuickSaleDto, SaleFilterDto, SaleResponseDto, UpdateSaleDto } from '../dto';
import { plainToInstance } from 'class-transformer';
import { Branch, Inventory, MovementStatus, MovementType, MovementConcept, Area } from 'src/logistics/entities';
import { SaleGateway } from '../gateway/sale.gateway';
import { SaleDiscount } from '../entities/sale-discount.entity';
import { MailService } from 'src/common/mail/mail.service';
import { PdfService } from 'src/common/pdf/pdf.service';
import { PreparationStatus } from '../entities/sale-detail.entity';
import { AreaService } from 'src/logistics/services/area.service';

@Injectable()
export class SaleService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,

    private readonly customerService: CustomerService,
    private readonly discountCodeService: DiscountCodeService,
    private readonly productService: ProductService,
    private readonly inventoryMovementService: InventoryMovementService,
    private readonly dataSource: DataSource,
    private readonly saleGateway: SaleGateway,
    private readonly mailService: MailService,
    private readonly pdfService: PdfService,
    private readonly areaService: AreaService,
  ) {}

  async create(dto: CreateSaleDto): Promise<SaleResponseDto> {
    if (!dto.invoiceNumber) {
      const { nextNumber } = await this.generateNextInvoiceNumber();
      dto.invoiceNumber = nextNumber;
    }

    if (!dto.customerId && !dto.guestCustomer) {
      const cf = await this.customerService.getOrCreateConsumidorFinal();
      dto.customerId = cf.id;
    }

    const existingInvoice = await this.saleRepository.findOne({
      where: { invoiceNumber: dto.invoiceNumber },
      withDeleted: false,
    });

    if (existingInvoice) throw new ConflictException(`La factura ${dto.invoiceNumber} ya existe`);

    if (dto.customerId && dto.guestCustomer) {
      throw new BadRequestException('No puede proporcionar customerId y guestCustomer al mismo tiempo.');
    }

    if (!dto.customerId && !dto.guestCustomer) {
      throw new BadRequestException('Debe proporcionar customerId o guestCustomer.');
    }

    let customer: any = null;

    if (dto.customerId) {
      try {
        customer = await this.customerService.findOne(dto.customerId);
      } catch {
        throw new BadRequestException(`El cliente con ID ${dto.customerId} no existe`);
      }
    }

    const branch = await this.branchRepository.findOne({
      where: { id: dto.branchId, deletedAt: IsNull() },
    });

    if (!branch) {
      throw new BadRequestException('Sucursal no válida.');
    }

    if (!dto.details?.length) throw new BadRequestException('La venta debe tener al menos un detalle');

    const stockErrors: string[] = [];

    for (const detailDto of dto.details) {
      const stockQuery = await this.dataSource.createQueryBuilder().select(['product.id', 'product.name', 'COALESCE(SUM(inventory.stock), 0) AS current_stock']).from('products', 'product').leftJoin('inventories', 'inventory', 'inventory.product_id = product.id AND inventory.branch_id = :branchId', { branchId: dto.branchId }).where('product.id = :productId', { productId: detailDto.productId }).andWhere('product.deletedAt IS NULL').groupBy('product.id').getRawOne();

      if (!stockQuery) {
        stockErrors.push(`Producto con ID ${detailDto.productId} no encontrado`);
        continue;
      }

      const currentStock = Number(stockQuery.current_stock);
      const productName = stockQuery.product_name;

      if (currentStock < detailDto.quantity) {
        stockErrors.push(`Producto "${productName}" - Stock insuficiente: solicitado ${detailDto.quantity}, disponible ${currentStock}`);
      }
    }

    if (stockErrors.length > 0) {
      throw new BadRequestException({
        message: 'Error de stock en los productos',
        errors: stockErrors,
      });
    }

    if (dto.customerId) {
      const estimatedTotal = dto.details.reduce((sum, d) => sum + d.quantity * d.unitPrice, 0);
      const creditLimit = Number(customer.creditLimit || 0);

      if (creditLimit > 0 && estimatedTotal > creditLimit) {
        throw new BadRequestException(`El total de la venta (Q${estimatedTotal.toFixed(2)}) excede el límite de crédito del cliente (Q${creditLimit.toFixed(2)})`);
      }
    }

    let discountCode: any = null;
    let discountCodeAmount: number = 0;

    if (dto.discountCodeId) {
      discountCode = await this.discountCodeService.findOne(dto.discountCodeId);

      const subtotalPrecalc = dto.details.reduce((sum, d) => sum + d.quantity * d.unitPrice, 0);

      const validation = await this.discountCodeService.validateDiscountCode(discountCode.code, dto.customerId, undefined, subtotalPrecalc);

      if (!validation.isValid) {
        throw new BadRequestException(`Código de descuento inválido: ${validation.message}`);
      }

      discountCodeAmount = validation.discountAmount;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const sale = qr.manager.create(Sale, {
        invoiceNumber: dto.invoiceNumber,
        date: dto.date ? new Date(dto.date) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: SaleStatus.PENDING,
        notes: dto.notes || null,
        customer: dto.customerId ? { id: dto.customerId } : undefined,
        guestCustomer: dto.guestCustomer ?? undefined,
        branch: { id: dto.branchId },
        discountCode: dto.discountCodeId ? { id: dto.discountCodeId } : null,
        applyTax: dto.applyTax ?? true,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        paidAmount: 0,
        pendingAmount: 0,
      });

      const savedSale = await qr.manager.save(sale);

      let subtotal = 0;
      let taxAmount = 0;
      let lineDiscounts = 0;

      for (const detailDto of dto.details) {
        const product = await this.productService.findOne(detailDto.productId);

        const lineSubtotal = detailDto.quantity * detailDto.unitPrice;

        let lineDiscount = 0;
        let discountPct = detailDto.discount || 0;

        if (detailDto.discountType === DiscountType.FIXED_AMOUNT) {
          lineDiscount = detailDto.discountAmount || 0;
          discountPct = lineSubtotal > 0 ? (lineDiscount / lineSubtotal) * 100 : 0;
        } else {
          lineDiscount = (lineSubtotal * discountPct) / 100;
        }

        const lineAfterDiscount = lineSubtotal - lineDiscount;
        const lineTax = sale.applyTax ? (lineAfterDiscount * (detailDto.taxPercentage ?? 12)) / 100 : 0;
        const lineTotal = lineAfterDiscount + lineTax;

        const detail = qr.manager.create(SaleDetail, {
          sale: savedSale,
          product: { id: detailDto.productId },
          quantity: detailDto.quantity,
          unitPrice: detailDto.unitPrice,
          discount: discountPct,
          discountAmount: lineDiscount,
          discountType: detailDto.discountType || DiscountType.PERCENTAGE,
          taxPercentage: sale.applyTax ? (detailDto.taxPercentage ?? 12) : 0,
          taxAmount: lineTax,
          lineTotal,
          currentArea: product.area ? (product.area as any) : null,
          preparationStatus: PreparationStatus.PENDING,
          originalPrice: detailDto.originalPrice || product.price,
          notes: detailDto.notes,
        });

        await qr.manager.save(detail);

        subtotal += lineSubtotal;
        lineDiscounts += lineDiscount;
        taxAmount += lineTax;
      }

      let manualDiscountsAmount = 0;

      if (dto.discounts?.length) {
        for (const disDto of dto.discounts) {
          let amount = 0;

          if (disDto.type === 'percent') {
            amount = subtotal * (disDto.value / 100);
          } else {
            amount = disDto.value;
          }

          manualDiscountsAmount += amount;

          const saleDiscount = qr.manager.create(SaleDiscount, {
            sale: savedSale,
            type: disDto.type,
            value: disDto.value,
            amountApplied: amount,
            reason: disDto.reason || null,
          });

          await qr.manager.save(saleDiscount);
        }
      }

      const globalDiscounts = manualDiscountsAmount + discountCodeAmount;
      const totalDiscounts = lineDiscounts + globalDiscounts;

      const taxableBase = subtotal - lineDiscounts;
      const finalTaxAmount = taxableBase > 0 ? taxAmount * ((taxableBase - globalDiscounts) / taxableBase) : 0;

      const total = taxableBase - globalDiscounts + finalTaxAmount;

      await qr.manager.update(Sale, savedSale.id, {
        subtotal,
        taxAmount: finalTaxAmount,
        discountAmount: totalDiscounts,
        total,
        pendingAmount: total,
      });

      await qr.commitTransaction();

      const finalSale = await this.findOne(savedSale.id);

      this.saleGateway.notifyNewSale(finalSale);

      const nextNumber = await this.generateNextInvoiceNumber();
      this.saleGateway.broadcastNextInvoiceNumber(nextNumber.nextNumber);

      return finalSale;
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async createQuickSale(dto: QuickSaleDto, userId?: string): Promise<SaleResponseDto> {
    if (!dto.invoiceNumber) {
      const { nextNumber } = await this.generateNextInvoiceNumber();
      dto.invoiceNumber = nextNumber;
    }

    if (!dto.customerId && !dto.guestCustomer) {
      const cf = await this.customerService.getOrCreateConsumidorFinal();
      dto.customerId = cf.id;
    }

    const existingInvoice = await this.saleRepository.findOne({
      where: { invoiceNumber: dto.invoiceNumber },
      withDeleted: false,
    });

    if (existingInvoice) throw new ConflictException(`La factura ${dto.invoiceNumber} ya existe`);

    if (dto.customerId && dto.guestCustomer) {
      throw new BadRequestException('No puede proporcionar customerId y guestCustomer al mismo tiempo.');
    }

    if (!dto.customerId && !dto.guestCustomer) {
      throw new BadRequestException('Debe proporcionar customerId o guestCustomer.');
    }

    let customer: any = null;
    if (dto.customerId) {
      try {
        customer = await this.customerService.findOne(dto.customerId);
      } catch {
        throw new BadRequestException(`El cliente con ID ${dto.customerId} no existe`);
      }
    }

    const branch = await this.branchRepository.findOne({
      where: { id: dto.branchId, deletedAt: IsNull() },
    });

    if (!branch) {
      throw new BadRequestException('Sucursal no válida.');
    }

    if (!dto.details?.length) throw new BadRequestException('La venta debe tener al menos un detalle');

    // 1. Stock Check
    const stockErrors: string[] = [];
    for (const detailDto of dto.details) {
      const stockQuery = await this.dataSource
        .createQueryBuilder()
        .select(['product.id', 'product.name', 'product.manageStock', 'COALESCE(SUM(inventory.stock), 0) AS current_stock'])
        .from('products', 'product')
        .leftJoin('inventories', 'inventory', 'inventory.product_id = product.id AND inventory.branch_id = :branchId', { branchId: dto.branchId })
        .where('product.id = :productId', { productId: detailDto.productId })
        .andWhere('product.deletedAt IS NULL')
        .groupBy('product.id')
        .getRawOne();

      if (!stockQuery) {
        stockErrors.push(`Producto con ID ${detailDto.productId} no encontrado`);
        continue;
      }

      // Extraemos los datos usando los nombres que TypeORM genera por defecto en Raw queries
      const currentStock = Number(stockQuery.current_stock || 0);
      const productName = stockQuery.product_name;
      const manageStock = stockQuery.product_manageStock === true || stockQuery.product_manageStock === 1;

      // Si el producto no gestiona stock, ignoramos el resto de la validación
      if (manageStock === false) continue;

      if (currentStock < detailDto.quantity) {
        stockErrors.push(`Producto "${productName}" - Stock insuficiente: solicitado ${detailDto.quantity}, disponible ${currentStock}`);
      }
    }

    if (stockErrors.length > 0) {
      throw new BadRequestException({ message: 'Error de stock en los productos', errors: stockErrors });
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 2. Create Sale
      const sale = qr.manager.create(Sale, {
        invoiceNumber: dto.invoiceNumber,
        date: dto.date ? new Date(dto.date) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: dto.finalStatus || SaleStatus.DELIVERED,
        notes: dto.notes || null,
        customer: dto.customerId ? { id: dto.customerId } : undefined,
        guestCustomer: dto.guestCustomer ?? undefined,
        branch: { id: dto.branchId },
        discountCode: dto.discountCodeId ? { id: dto.discountCodeId } : null,
        applyTax: dto.applyTax ?? true,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        paidAmount: 0,
        pendingAmount: 0,
      } as DeepPartial<Sale>);

      const savedSale = await qr.manager.save(sale);

      // 3. Create Details and calculate totals
      let subtotal = 0;
      let taxAmount = 0;
      let lineDiscounts = 0;

      for (const detailDto of dto.details) {
        const product = await this.productService.findOne(detailDto.productId);
        const lineSubtotal = detailDto.quantity * detailDto.unitPrice;
        let lineDiscount = 0;
        let discountPct = detailDto.discount || 0;

        if (detailDto.discountType === DiscountType.FIXED_AMOUNT) {
          lineDiscount = detailDto.discountAmount || 0;
          discountPct = lineSubtotal > 0 ? (lineDiscount / lineSubtotal) * 100 : 0;
        } else {
          lineDiscount = (lineSubtotal * discountPct) / 100;
        }

        const lineAfterDiscount = lineSubtotal - lineDiscount;
        const lineTax = sale.applyTax ? (lineAfterDiscount * (detailDto.taxPercentage ?? 12)) / 100 : 0;
        const lineTotal = lineAfterDiscount + lineTax;

        const detail = qr.manager.create(SaleDetail, {
          sale: savedSale,
          product: { id: detailDto.productId },
          quantity: detailDto.quantity,
          unitPrice: detailDto.unitPrice,
          discount: discountPct,
          discountAmount: lineDiscount,
          discountType: detailDto.discountType || DiscountType.PERCENTAGE,
          taxPercentage: sale.applyTax ? (detailDto.taxPercentage ?? 12) : 0,
          taxAmount: lineTax,
          lineTotal,
          currentArea: product.area ? (product.area as any) : null,
          preparationStatus: PreparationStatus.COMPLETED,
          originalPrice: detailDto.originalPrice || product.price,
          notes: detailDto.notes,
        });

        await qr.manager.save(detail);

        // 4. Inventory Movements (Immediately)
        await this.inventoryMovementService.create(
          {
            productId: detailDto.productId,
            branchId: dto.branchId,
            quantity: detailDto.quantity,
            type: MovementType.OUT,
            notes: `Venta Rápida ${sale.invoiceNumber}`,
            unitCost: product.cost,
            totalCost: detailDto.quantity * product.cost,
            status: MovementStatus.COMPLETED,
            referenceId: savedSale.id,
            referenceNumber: sale.invoiceNumber,
            concept: MovementConcept.SALE,
          },
          userId,
          true,
          qr.manager,
        );

        subtotal += lineSubtotal;
        lineDiscounts += lineDiscount;
        taxAmount += lineTax;
      }

      // 5. Global Discounts
      let manualDiscountsAmount = 0;
      if (dto.discounts?.length) {
        for (const disDto of dto.discounts) {
          let amount = disDto.type === 'percent' ? subtotal * (disDto.value / 100) : disDto.value;
          manualDiscountsAmount += amount;
          await qr.manager.save(qr.manager.create(SaleDiscount, {
            sale: savedSale,
            type: disDto.type,
            value: disDto.value,
            amountApplied: amount,
            reason: disDto.reason || null,
          }));
        }
      }

      let discountCodeAmount = 0;
      if (dto.discountCodeId) {
        const discountCode = await this.discountCodeService.findOne(dto.discountCodeId);
        const validation = await this.discountCodeService.validateDiscountCode(discountCode.code, dto.customerId, undefined, subtotal);
        if (validation.isValid) discountCodeAmount = validation.discountAmount;
      }

      const globalDiscounts = manualDiscountsAmount + discountCodeAmount;
      const totalDiscounts = lineDiscounts + globalDiscounts;
      const taxableBase = subtotal - lineDiscounts;
      const finalTaxAmount = taxableBase > 0 ? taxAmount * ((taxableBase - globalDiscounts) / taxableBase) : 0;
      const total = taxableBase - globalDiscounts + finalTaxAmount;

      // 6. Payments
      let paidAmount = 0;
      if (dto.payments?.length) {
        for (const payDto of dto.payments) {
          const payment = qr.manager.create(SalePayment, {
            sale: savedSale,
            paymentMethod: { id: payDto.paymentMethodId },
            amount: payDto.amount,
            date: payDto.date ? new Date(payDto.date) : new Date(),
            referenceNumber: payDto.referenceNumber,
            bankAccount: payDto.bankAccountId ? { id: payDto.bankAccountId } : null,
            manualBankAccount: payDto.manualBankAccount,
            status: payDto.status || PaymentStatus.COMPLETED,
            isDownPayment: false,
            notes: payDto.notes,
          });
          await qr.manager.save(payment);
          paidAmount += Number(payDto.amount);
        }
      }

      const pendingAmount = total - paidAmount;

      await qr.manager.update(Sale, savedSale.id, {
        subtotal,
        taxAmount: finalTaxAmount,
        discountAmount: totalDiscounts,
        total,
        paidAmount,
        pendingAmount,
      });

      // 7. Post-process
      if (dto.customerId) {
        await this.customerService.updatePurchaseStats(dto.customerId, total);
      }

      if (dto.discountCodeId) {
        const discountCode = await this.discountCodeService.findOne(dto.discountCodeId);
        await this.discountCodeService.applyDiscountCode(discountCode.code, savedSale.id);
      }

      await qr.commitTransaction();

      const finalSale = await this.findOne(savedSale.id);
      this.saleGateway.notifyNewSale(finalSale);
      const nextNumber = await this.generateNextInvoiceNumber();
      this.saleGateway.broadcastNextInvoiceNumber(nextNumber.nextNumber);

      return finalSale;
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async findAll(filterDto: SaleFilterDto): Promise<any> {
    const { status, branchId, startDate, endDate, areaId, onlyAreaDetails, groupBy, page = 1, limit = 50, search } = filterDto;

    // 1. Build Query
    const query = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('customer.category', 'customerCategory')
      .leftJoinAndSelect('sale.branch', 'branch')
      .where('sale.deletedAt IS NULL');

    // 2. Load details only if needed (Kanban or worklists)
    const needsDetails = groupBy || areaId || onlyAreaDetails;
    if (needsDetails) {
      query
        .leftJoinAndSelect('sale.details', 'details')
        .leftJoinAndSelect('details.product', 'product')
        .leftJoinAndSelect('product.unit', 'unit')
        .leftJoinAndSelect('product.area', 'area')
        .leftJoinAndSelect('details.currentArea', 'currentArea');
    }

    // 3. Apply Filters
    if (status) query.andWhere('sale.status = :status', { status });
    if (branchId) query.andWhere('branch.id = :branchId', { branchId });
    if (search) {
      query.andWhere('(sale.invoiceNumber ILIKE :search OR customer.name ILIKE :search OR customer.nit ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    // Date Filters
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.andWhere('sale.date >= :start', { start });
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.andWhere('sale.date <= :end', { end });
      }
    } else if (!search) {
      // Default: Last 6 months
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      query.andWhere('sale.date >= :start', { start });
    }

    if (areaId) query.andWhere('details.currentArea = :areaId', { areaId });

    query.orderBy('sale.date', 'DESC').addOrderBy('sale.createdAt', 'DESC');

    // 4. If GroupBy is present, we handle the special formatted response (Kanban/Preparation)
    // IMPORTANT: Table view calls this without groupBy if it wants a flat list.
    if (groupBy) {
      const allSales = await query.getMany();
      const instanceResponse = plainToInstance(SaleResponseDto, allSales);

      if (groupBy === 'status') {
        const grouped = instanceResponse.reduce((acc, sale) => {
          const key = sale.status;
          if (!acc[key]) acc[key] = { total: 0, orders: [] };
          acc[key].orders.push(sale);
          acc[key].total++;
          return acc;
        }, {} as Record<string, any>);
        return grouped;
      }

      if (groupBy === 'preparationStatus') {
        const items: Record<string, any> = {};
        instanceResponse.forEach((sale) => {
          sale.details?.forEach((detail: any) => {
            if (areaId && detail.currentArea?.id !== areaId) return;
            const key = detail.preparationStatus || 'pending';
            if (!items[key]) items[key] = { total: 0, items: [] };
            items[key].items.push({ ...detail, saleId: sale.id, invoiceNumber: sale.invoiceNumber, customerName: sale.customer?.name });
            items[key].total++;
          });
        });
        return items;
      }
    }

    // 5. Default Paginated Response (Table View)
    const take = Number(limit);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [sales, total] = await query.skip(skip).take(take).getManyAndCount();

    // Use the DTO to ensure the "data" field exists in the output
    return plainToInstance(PaginatedSaleResponseDto, {
      data: sales,
      total,
      page: Number(page),
      limit: take,
    });
  }

  async findOne(id: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'customer.category', 'discountCode', 'branch', 'details', 'details.product', 'details.product.unit', 'details.product.inventories', 'details.product.inventories.branch', 'payments', 'payments.paymentMethod', 'payments.bankAccount', 'discounts'],
      order: {
        payments: {
          createdAt: 'DESC',
        },
      },
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (sale.details) {
      sale.details.forEach((detail) => {
        const inventory = detail.product.inventories?.find((inv) => inv.branch?.id === sale.branch?.id);
        (detail.product as any).stock = inventory ? Number(inventory.stock) : 0;
      });
    }

    return plainToInstance(SaleResponseDto, sale);
  }

  async findByCustomer(customerId: string): Promise<SaleResponseDto[]> {
    const sales = await this.saleRepository.find({
      where: {
        customer: { id: customerId },
        deletedAt: IsNull(),
      },
      relations: ['customer', 'customer.category', 'discountCode', 'details', 'details.product', 'details.product.unit'],
      order: { date: 'DESC' },
    });
    return plainToInstance(SaleResponseDto, sales);
  }

  async findByStatus(status: SaleStatus): Promise<SaleResponseDto[]> {
    const sales = await this.saleRepository.find({
      where: { status, deletedAt: IsNull() },
      relations: ['customer', 'customer.category', 'discountCode', 'details', 'details.product', 'details.product.unit'],
      order: { date: 'DESC' },
    });
    return plainToInstance(SaleResponseDto, sales);
  }

  async confirmSale(id: string, branchId?: string, userId?: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['details', 'details.product', 'customer', 'branch'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException('Solo se pueden confirmar ventas pendientes');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const detail of sale.details) {
        await this.inventoryMovementService.create(
          {
            productId: detail.product.id,
            branchId: branchId || sale.branch.id,
            quantity: detail.quantity,
            type: MovementType.OUT,
            notes: `Venta ${sale.invoiceNumber}`,
            unitCost: detail.product.cost,
            totalCost: detail.quantity * detail.product.cost,
            status: MovementStatus.COMPLETED,
            referenceNumber: sale.invoiceNumber,
            concept: MovementConcept.SALE,
          },
          userId,
          true,
          queryRunner.manager,
        );
      }

      sale.status = SaleStatus.CONFIRMED;
      await queryRunner.manager.save(sale);

      if (sale.customer) {
        await this.customerService.updatePurchaseStats(sale.customer.id, sale.total);
      }

      if (sale.discountCode) {
        await this.discountCodeService.applyDiscountCode(sale.discountCode.code, sale.id);
      }

      await queryRunner.commitTransaction();
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deliverSale(id: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('No se puede entregar una venta cancelada');
    }

    if (sale.status === SaleStatus.PENDING) {
      throw new BadRequestException('Debe confirmar la venta antes de marcarla como entregada');
    }

    sale.status = SaleStatus.DELIVERED;
    await this.saleRepository.save(sale);
    return this.findOne(id);
  }

  async cancelSale(id: string, userId?: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'details', 'details.product', 'branch', 'discountCode'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (sale.status === SaleStatus.CANCELLED) {
      throw new ConflictException('La venta ya está cancelada');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (sale.status !== SaleStatus.PENDING) {
        for (const detail of sale.details) {
          await this.inventoryMovementService.create(
            {
              productId: detail.product.id,
              branchId: sale.branch.id,
              quantity: detail.quantity,
              type: MovementType.IN,
              notes: `Cancelación de Venta ${sale.invoiceNumber}`,
              unitCost: detail.product.cost,
              totalCost: detail.quantity * detail.product.cost,
              status: MovementStatus.COMPLETED,
              referenceId: sale.id,
              referenceNumber: sale.invoiceNumber,
              concept: MovementConcept.RETURN,
            },
            userId,
            true,
          );
        }

        if (sale.customer) {
          await this.customerService.updatePurchaseStats(
            sale.customer.id,
            -sale.total,
          );
        }

        if (sale.discountCode) {
          await this.discountCodeService.revertDiscountCodeUsage(sale.discountCode.code);
        }
      }

      sale.status = SaleStatus.CANCELLED;
      await queryRunner.manager.save(sale);

      await queryRunner.commitTransaction();
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: string, dto: UpdateSaleDto): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'branch', 'details', 'discounts'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException('Solo se pueden editar ventas en estado PENDIENTE');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      if (dto.invoiceNumber && dto.invoiceNumber !== sale.invoiceNumber) {
        const existing = await this.saleRepository.findOne({
          where: { invoiceNumber: dto.invoiceNumber, deletedAt: IsNull() },
        });
        if (existing) throw new ConflictException(`La factura ${dto.invoiceNumber} ya existe`);
        sale.invoiceNumber = dto.invoiceNumber;
      }

      if (dto.date) sale.date = new Date(dto.date);
      if (dto.dueDate !== undefined) sale.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (dto.notes !== undefined) sale.notes = dto.notes;
      if (dto.applyTax !== undefined) sale.applyTax = dto.applyTax;

      if (dto.customerId) sale.customer = { id: dto.customerId } as any;
      if (dto.guestCustomer) {
        sale.guestCustomer = dto.guestCustomer;
        sale.customer = null;
      }

      const branchId = dto.branchId || sale.branch.id;

      if (dto.details) {
        const stockErrors: string[] = [];
        for (const det of dto.details) {
          const inventory = await qr.manager.findOne(Inventory, {
            where: { product: { id: det.productId }, branch: { id: branchId } },
          });
          if (!inventory || inventory.stock < det.quantity) {
            stockErrors.push(`Stock insuficiente para producto ID ${det.productId}`);
          }
        }
        if (stockErrors.length > 0)
          throw new BadRequestException({
            message: 'Error de stock',
            errors: stockErrors,
          });

        await qr.manager.delete(SaleDetail, { sale: { id: sale.id } });

        let subtotal = 0;
        let taxAmount = 0;
        let lineDiscounts = 0;
        const newDetails: SaleDetail[] = [];

        for (const detailDto of dto.details) {
          const lineSubtotal = detailDto.quantity * detailDto.unitPrice;
          const lineDiscount = (lineSubtotal * (detailDto.discount || 0)) / 100;
          const lineAfterDiscount = lineSubtotal - lineDiscount;
          const lineTax = sale.applyTax ? (lineAfterDiscount * (detailDto.taxPercentage ?? 12)) / 100 : 0;
          const lineTotal = lineAfterDiscount + lineTax;

          const detail = qr.manager.create(SaleDetail, {
            sale: sale,
            product: { id: detailDto.productId },
            quantity: detailDto.quantity,
            unitPrice: detailDto.unitPrice,
            discount: detailDto.discount || 0,
            discountAmount: lineDiscount,
            taxPercentage: sale.applyTax ? (detailDto.taxPercentage ?? 12) : 0,
            taxAmount: lineTax,
            lineTotal,
          });
          newDetails.push(detail);

          subtotal += lineSubtotal;
          lineDiscounts += lineDiscount;
          taxAmount += lineTax;
        }
        sale.details = newDetails;
        sale.subtotal = subtotal;
        sale.taxAmount = taxAmount;
        sale.discountAmount = lineDiscounts;
      }

      const currentLineDiscounts = dto.details ? sale.discountAmount : sale.discountAmount - (sale.discounts?.reduce((acc, d) => acc + Number(d.amountApplied), 0) || 0);
      const baseTaxAmount = sale.taxAmount;
      const baseLineDiscounts = dto.details ? sale.discountAmount : Number(sale.discountAmount) - (sale.discounts?.reduce((acc, d) => acc + Number(d.amountApplied), 0) || 0);
      const currentTaxAmount = sale.taxAmount;
      const currentLineDiscountsFinal = dto.details ? sale.discountAmount : Number(sale.discountAmount) - (sale.discounts?.reduce((acc, d) => acc + Number(d.amountApplied), 0) || 0);

      let discountCodeAmount = 0;
      if (sale.discountCode) {
        const validation = await this.discountCodeService.validateDiscountCode(sale.discountCode.code, sale.customer?.id, undefined, sale.subtotal);
        if (validation.isValid) discountCodeAmount = validation.discountAmount;
      }

      let manualDiscountsAmount = 0;
      if (dto.discounts) {
        await qr.manager.delete(SaleDiscount, { sale: { id: sale.id } });
        const newDiscounts: SaleDiscount[] = [];
        for (const disDto of dto.discounts) {
          const amount = disDto.type === 'percent' ? sale.subtotal * (disDto.value / 100) : disDto.value;

          manualDiscountsAmount += amount;
          newDiscounts.push(
            qr.manager.create(SaleDiscount, {
              sale,
              type: disDto.type,
              value: disDto.value,
              amountApplied: amount,
              reason: disDto.reason,
            }),
          );
        }
        sale.discounts = newDiscounts;
      } else {
        for (const dis of sale.discounts) {
          if (dis.type === 'percent') {
            dis.amountApplied = sale.subtotal * (dis.value / 100);
          }
          manualDiscountsAmount += dis.amountApplied;
        }
      }

      const globalDiscounts = manualDiscountsAmount + discountCodeAmount;
      const totalDiscounts = currentLineDiscountsFinal + globalDiscounts;

      const taxableBase = sale.subtotal - currentLineDiscountsFinal;
      const finalTaxAmount = taxableBase > 0 ? currentTaxAmount * ((taxableBase - globalDiscounts) / taxableBase) : 0;

      sale.taxAmount = finalTaxAmount;
      sale.discountAmount = totalDiscounts;
      sale.total = taxableBase - globalDiscounts + finalTaxAmount;
      sale.pendingAmount = sale.total - (sale.paidAmount || 0);

      await qr.manager.save(sale);
      await qr.commitTransaction();

      return this.findOne(id);
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['payments'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (sale.payments && sale.payments.length > 0) {
      throw new ConflictException('No se puede eliminar una venta que tiene pagos asociados');
    }

    await this.saleRepository.softRemove(sale);
    return { message: 'Venta eliminada exitosamente' };
  }

  async getDailySales(date: string): Promise<SaleResponseDto[]> {
    const targetDate = new Date(date);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const sales = await this.saleRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('sale.details', 'details')
      .leftJoinAndSelect('details.product', 'product')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.date >= :startDate AND sale.date < :endDate', {
        startDate: targetDate,
        endDate: nextDate,
      })
      .andWhere('sale.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      })
      .orderBy('sale.date', 'DESC')
      .getMany();

    return plainToInstance(SaleResponseDto, sales);
  }

  async generateNextInvoiceNumber(): Promise<{ nextNumber: string }> {
    const currentYear = new Date().getFullYear();

    const lastInvoice = await this.saleRepository.findOne({
      where: {
        invoiceNumber: Like(`ORD-${currentYear}-%`),
      },
      order: { invoiceNumber: 'DESC' },
      withDeleted: false,
    });

    let sequence = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      const parts = lastInvoice.invoiceNumber.split('-');
      if (parts.length === 3) {
        const lastSequence = parseInt(parts[2]);
        if (!isNaN(lastSequence)) {
          sequence = lastSequence + 1;
        }
      }
    }

    const nextNumber = `ORD-${currentYear}-${sequence.toString().padStart(4, '0')}`;

    this.saleGateway.broadcastNextInvoiceNumber(nextNumber);

    return { nextNumber };
  }

  async sendSaleEmail(id: string): Promise<{ message: string }> {
    const sale = await this.saleRepository.findOne({
      where: { id },
      relations: ['customer', 'details', 'details.product', 'branch', 'payments', 'payments.paymentMethod'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    const email = sale.customer?.email || sale.guestCustomer?.email;

    if (!email) {
      throw new BadRequestException('La venta no tiene un correo electrónico asociado');
    }

    try {
      const pdfBuffer = await this.pdfService.generateInvoicePdf(sale);

      const subject = `Factura ${sale.invoiceNumber} - Sistema POS`;
      const text = `Hola ${sale.customer?.name || sale.guestCustomer?.name},\n\nAdjunto encontrarás la factura de tu compra correspondiente al número ${sale.invoiceNumber}.\n\nGracias por tu preferencia.`;

      await this.mailService.sendMail(email, subject, text, [
        {
          filename: `Factura_${sale.invoiceNumber}.pdf`,
          content: pdfBuffer,
        },
      ]);

      return { message: 'Correo enviado exitosamente' };
    } catch (error) {
      console.error('Error in sendSaleEmail:', error);
      throw new InternalServerErrorException('Ocurrió un error al procesar o enviar el correo electrónico');
    }
  }
  async advanceDetailStatus(detailId: string, status: PreparationStatus): Promise<SaleDetail> {
    const detail = await this.saleDetailRepository.findOne({
      where: { id: detailId },
      relations: ['currentArea', 'sale', 'product'],
    });

    if (!detail) {
      throw new NotFoundException(`Detalle de venta con ID ${detailId} no encontrado`);
    }

    detail.preparationStatus = status;

    if (status === PreparationStatus.COMPLETED && detail.currentArea) {
      const nextArea = await this.areaService.findNextArea(detail.currentArea.id);
      if (nextArea) {
        detail.currentArea = nextArea;
        detail.preparationStatus = PreparationStatus.PENDING;
      }
    }

    const savedDetail = await this.saleDetailRepository.save(detail);

    if (detail.sale) {
      const updatedSale = await this.findOne(detail.sale.id);
      this.saleGateway.notifyNewSale(updatedSale);
    }

    return savedDetail;
  }
}
