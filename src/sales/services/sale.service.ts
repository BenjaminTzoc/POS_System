import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
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
import { isSuperAdmin } from 'src/common/utils/user-scope.util';
import { PreparationStatus } from '../entities/sale-detail.entity';
import { AreaService } from 'src/logistics/services/area.service';

@Injectable()
export class SaleService {
  private readonly logger = new Logger(SaleService.name);

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

    const isPreorder = !!dto.isPreorder;
    if (isPreorder && !dto.promisedDeliveryDate) {
      throw new BadRequestException('La preorden requiere fecha de entrega prometida (promisedDeliveryDate)');
    }

    const stockErrors: string[] = [];

    if (!isPreorder) {
    for (const detailDto of dto.details) {
      const stockQuery = await this.dataSource
        .createQueryBuilder()
        .select([
          'product.id',
          'product.name',
          'product.manageStock',
          'COALESCE(SUM(inventory.stock), 0) AS current_stock',
          'COALESCE(SUM(inventory.reserved_stock), 0) AS reserved_stock',
          'COALESCE(bool_and(inventory.is_available), true) AS is_available',
        ])
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

      const currentStock = Number(stockQuery.current_stock || 0);
      const reservedStock = Number(stockQuery.reserved_stock || 0);
      const availableStock = Math.max(0, currentStock - reservedStock);
      const productName = stockQuery.product_name;
      const manageStock = stockQuery.product_manageStock === true || stockQuery.product_manageStock === 1;
      const isAvailable = stockQuery.is_available === true || stockQuery.is_available === 1 || stockQuery.is_available === '1' || stockQuery.is_available === null;

      if (manageStock === false) {
        if (!isAvailable) {
          stockErrors.push(`Producto "${productName}" no está disponible en esta sucursal`);
        }
        continue;
      }

      if (availableStock < detailDto.quantity) {
        stockErrors.push(`Producto "${productName}" - Stock disponible insuficiente: solicitado ${detailDto.quantity}, disponible ${availableStock} (Físico: ${currentStock}, Reservado: ${reservedStock})`);
      }
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

    // Generar OTP de 6 dígitos numéricos
    const deliveryOtp = Math.floor(100000 + Math.random() * 900000).toString();

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const sale = qr.manager.create(Sale, {
        invoiceNumber: dto.invoiceNumber,
        date: dto.date ? new Date(dto.date) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        billingStartDate: dto.billingStartDate ? new Date(dto.billingStartDate) : null,
        promisedDeliveryDate: dto.promisedDeliveryDate ? new Date(dto.promisedDeliveryDate) : null,
        isPreorder,
        status: SaleStatus.PENDING,
        deliveryOtp,
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

        // Aumentar stock reservado solo en ventas inmediatas (no preórdenes)
        if (!isPreorder && product.manageStock) {
          await qr.manager.increment(
            Inventory,
            {
              product: { id: product.id },
              branch: { id: dto.branchId },
              deletedAt: IsNull(),
            },
            'reservedStock',
            detailDto.quantity,
          );
        }

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
        .select([
          'product.id',
          'product.name',
          'product.manageStock',
          'COALESCE(SUM(inventory.stock), 0) AS current_stock',
          'COALESCE(bool_and(inventory.is_available), true) AS is_available',
        ])
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
      const isAvailable = stockQuery.is_available === true || stockQuery.is_available === 1 || stockQuery.is_available === '1' || stockQuery.is_available === null;

      // Si el producto no gestiona stock, verificamos si está habilitado en esta sucursal
      if (manageStock === false) {
        if (!isAvailable) {
          stockErrors.push(`Producto "${productName}" no está disponible en esta sucursal`);
        }
        continue;
      }

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
        billingStartDate: dto.billingStartDate ? new Date(dto.billingStartDate) : null,
        status: dto.finalStatus || SaleStatus.DELIVERED,
        deliveredAt: (dto.finalStatus === SaleStatus.DELIVERED || !dto.finalStatus) ? new Date() : null,
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

        if (product.manageStock) {
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
        }

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
    const { status, branchId, startDate, endDate, areaId, onlyAreaDetails, groupBy, page = 1, limit = 50, search, isPreorder, promisedDeliveryStart, promisedDeliveryEnd, folderId } = filterDto;

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

    if (isPreorder !== undefined) {
      query.andWhere('sale.isPreorder = :isPreorder', { isPreorder });
    }

    if (promisedDeliveryStart) {
      const start = new Date(`${promisedDeliveryStart}T00:00:00.000Z`);
      query.andWhere('sale.promisedDeliveryDate >= :promisedStart', { promisedStart: start });
    }
    if (promisedDeliveryEnd) {
      const end = new Date(`${promisedDeliveryEnd}T23:59:59.999Z`);
      query.andWhere('sale.promisedDeliveryDate <= :promisedEnd', { promisedEnd: end });
    }

    // Date Filters
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(`${startDate}T00:00:00.000Z`);
        query.andWhere('sale.date >= :start', { start });
      }
      if (endDate) {
        const end = new Date(`${endDate}T23:59:59.999Z`);
        query.andWhere('sale.date <= :end', { end });
      }
    } else if (!search && isPreorder === undefined && !promisedDeliveryStart && !promisedDeliveryEnd && !folderId) {
      // Default: Last 6 months
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      query.andWhere('sale.date >= :start', { start });
    }

    if (folderId) {
      query.innerJoin('sale_folder_items', 'folderItem', 'folderItem.sale_id = sale.id AND folderItem.folder_id = :folderId', { folderId });
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
        details: {
          createdAt: 'ASC',
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

    const confirmBranchId = branchId || sale.branch.id;

    if (sale.isPreorder) {
      const stockErrors: string[] = [];
      for (const detail of sale.details) {
        if (!detail.product?.manageStock) continue;

        const stockQuery = await this.dataSource
          .createQueryBuilder()
          .select([
            'COALESCE(SUM(inventory.stock), 0) AS current_stock',
            'COALESCE(SUM(inventory.reserved_stock), 0) AS reserved_stock',
            'product.name AS product_name',
          ])
          .from('products', 'product')
          .leftJoin('inventories', 'inventory', 'inventory.product_id = product.id AND inventory.branch_id = :branchId', {
            branchId: confirmBranchId,
          })
          .where('product.id = :productId', { productId: detail.product.id })
          .andWhere('product.deletedAt IS NULL')
          .groupBy('product.id')
          .getRawOne();

        const currentStock = Number(stockQuery?.current_stock || 0);
        const reservedStock = Number(stockQuery?.reserved_stock || 0);
        const availableStock = Math.max(0, currentStock - reservedStock);
        if (availableStock < Number(detail.quantity)) {
          stockErrors.push(
            `Producto "${stockQuery?.product_name || detail.product.name}" - Stock insuficiente para surtir la preorden: solicitado ${detail.quantity}, disponible ${availableStock}`,
          );
        }
      }

      if (stockErrors.length > 0) {
        throw new BadRequestException({
          message: 'No se puede confirmar la preorden: no hay stock suficiente. Produzca o reciba inventario primero.',
          errors: stockErrors,
        });
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const detail of sale.details) {
        if (detail.product?.manageStock) {
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

          if (!sale.isPreorder) {
            await queryRunner.manager.decrement(
              Inventory,
              {
                product: { id: detail.product.id },
                branch: { id: branchId || sale.branch.id },
                deletedAt: IsNull(),
              },
              'reservedStock',
              detail.quantity,
            );
          }
        }
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
    sale.deliveredAt = new Date();
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
          if (!detail.product?.manageStock) continue;

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
      } else if (!sale.isPreorder) {
        // Si estaba PENDING y no es preorden, liberar la reserva de inventario
        for (const detail of sale.details) {
          if (detail.product?.manageStock) {
            await queryRunner.manager.decrement(
              Inventory,
              {
                product: { id: detail.product.id },
                branch: { id: sale.branch.id },
                deletedAt: IsNull(),
              },
              'reservedStock',
              detail.quantity,
            );
          }
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
      relations: ['customer', 'branch', 'details', 'details.product', 'discounts'],
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
      if (dto.billingStartDate !== undefined) sale.billingStartDate = dto.billingStartDate ? new Date(dto.billingStartDate) : null;
      if (dto.promisedDeliveryDate !== undefined) {
        sale.promisedDeliveryDate = dto.promisedDeliveryDate ? new Date(dto.promisedDeliveryDate) : null;
      }
      if (dto.notes !== undefined) sale.notes = dto.notes;
      if (dto.applyTax !== undefined) sale.applyTax = dto.applyTax;

      if (dto.customerId) sale.customer = { id: dto.customerId } as any;
      if (dto.guestCustomer) {
        sale.guestCustomer = dto.guestCustomer;
        sale.customer = null;
      }

      const branchId = dto.branchId || sale.branch.id;
      const wasPreorder = !!sale.isPreorder;

      if (dto.isPreorder !== undefined && !!dto.isPreorder !== wasPreorder) {
        if (dto.isPreorder && !sale.promisedDeliveryDate) {
          throw new BadRequestException('La preorden requiere fecha de entrega prometida (promisedDeliveryDate)');
        }

        if (dto.isPreorder) {
          for (const d of sale.details || []) {
            if (!d.product?.manageStock) continue;
            await qr.manager.decrement(
              Inventory,
              { product: { id: d.product.id }, branch: { id: branchId }, deletedAt: IsNull() },
              'reservedStock',
              Number(d.quantity),
            );
          }
        }

        sale.isPreorder = !!dto.isPreorder;
      }

      if (sale.isPreorder && !sale.promisedDeliveryDate) {
        throw new BadRequestException('La preorden requiere fecha de entrega prometida (promisedDeliveryDate)');
      }

      if (dto.details) {
        const oldQtyByProduct = new Map<string, number>();
        for (const d of sale.details || []) {
          const pid = d.product?.id;
          if (!pid) continue;
          oldQtyByProduct.set(pid, (oldQtyByProduct.get(pid) || 0) + Number(d.quantity));
        }

        const newQtyByProduct = new Map<string, number>();
        for (const det of dto.details) {
          newQtyByProduct.set(det.productId, (newQtyByProduct.get(det.productId) || 0) + Number(det.quantity));
        }

        if (!sale.isPreorder) {
          const stockErrors: string[] = [];

          for (const [productId, needed] of newQtyByProduct.entries()) {
            const stockQuery = await qr.manager
              .createQueryBuilder()
              .select([
                'product.id',
                'product.name',
                'product.manageStock',
                'COALESCE(SUM(inventory.stock), 0) AS current_stock',
                'COALESCE(SUM(inventory.reserved_stock), 0) AS reserved_stock',
                'COALESCE(bool_and(inventory.is_available), true) AS is_available',
              ])
              .from('products', 'product')
              .leftJoin(
                'inventories',
                'inventory',
                'inventory.product_id = product.id AND inventory.branch_id = :branchId',
                { branchId },
              )
              .where('product.id = :productId', { productId })
              .andWhere('product.deletedAt IS NULL')
              .groupBy('product.id')
              .getRawOne();

            if (!stockQuery) {
              stockErrors.push(`Producto con ID ${productId} no encontrado`);
              continue;
            }

            const currentStock = Number(stockQuery.current_stock || 0);
            const reservedStock = Number(stockQuery.reserved_stock || 0);
            const productName = stockQuery.product_name;
            const manageStock = stockQuery.product_manageStock === true || stockQuery.product_manageStock === 1;
            const isAvailable =
              stockQuery.is_available === true ||
              stockQuery.is_available === 1 ||
              stockQuery.is_available === '1' ||
              stockQuery.is_available === null;

            if (manageStock === false) {
              if (!isAvailable) {
                stockErrors.push(`Producto "${productName}" no está disponible en esta sucursal`);
              }
              continue;
            }

            const reservedByThisSale = wasPreorder ? 0 : oldQtyByProduct.get(productId) || 0;
            const availableStock = Math.max(0, currentStock - reservedStock + reservedByThisSale);

            if (availableStock < needed) {
              stockErrors.push(
                `Producto "${productName}" - Stock disponible insuficiente: solicitado ${needed}, disponible ${availableStock} (Físico: ${currentStock}, Reservado: ${reservedStock})`,
              );
            }
          }

          if (stockErrors.length > 0) {
            throw new BadRequestException({
              message: 'Error de stock en los productos',
              errors: stockErrors,
            });
          }

          const productIds = new Set([...oldQtyByProduct.keys(), ...newQtyByProduct.keys()]);
          for (const productId of productIds) {
            const product = await this.productService.findOne(productId);
            if (!product.manageStock) continue;

            const delta =
              (newQtyByProduct.get(productId) || 0) - (wasPreorder ? 0 : oldQtyByProduct.get(productId) || 0);
            if (delta === 0) continue;

            if (delta > 0) {
              await qr.manager.increment(
                Inventory,
                { product: { id: productId }, branch: { id: branchId }, deletedAt: IsNull() },
                'reservedStock',
                delta,
              );
            } else {
              await qr.manager.decrement(
                Inventory,
                { product: { id: productId }, branch: { id: branchId }, deletedAt: IsNull() },
                'reservedStock',
                Math.abs(delta),
              );
            }
          }
        }

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
      } else if (wasPreorder && !sale.isPreorder) {
        const stockErrors: string[] = [];
        for (const d of sale.details || []) {
          if (!d.product?.manageStock) continue;

          const stockQuery = await qr.manager
            .createQueryBuilder()
            .select([
              'product.name',
              'COALESCE(SUM(inventory.stock), 0) AS current_stock',
              'COALESCE(SUM(inventory.reserved_stock), 0) AS reserved_stock',
            ])
            .from('products', 'product')
            .leftJoin(
              'inventories',
              'inventory',
              'inventory.product_id = product.id AND inventory.branch_id = :branchId',
              { branchId },
            )
            .where('product.id = :productId', { productId: d.product.id })
            .andWhere('product.deletedAt IS NULL')
            .groupBy('product.id')
            .getRawOne();

          const currentStock = Number(stockQuery?.current_stock || 0);
          const reservedStock = Number(stockQuery?.reserved_stock || 0);
          const availableStock = Math.max(0, currentStock - reservedStock);
          if (availableStock < Number(d.quantity)) {
            stockErrors.push(
              `Producto "${stockQuery?.product_name || d.product.name}" - Stock insuficiente para dejar de ser preorden: solicitado ${d.quantity}, disponible ${availableStock}`,
            );
          }
        }

        if (stockErrors.length > 0) {
          throw new BadRequestException({
            message: 'Error de stock en los productos',
            errors: stockErrors,
          });
        }

        for (const d of sale.details || []) {
          if (!d.product?.manageStock) continue;
          await qr.manager.increment(
            Inventory,
            { product: { id: d.product.id }, branch: { id: branchId }, deletedAt: IsNull() },
            'reservedStock',
            Number(d.quantity),
          );
        }
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

  async generatePdf(id: string): Promise<{ buffer: Buffer; invoiceNumber: string }> {
    const sale = await this.saleRepository.findOne({
      where: { id },
      relations: ['customer', 'details', 'details.product', 'branch', 'payments', 'payments.paymentMethod'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    const buffer = await this.pdfService.generateInvoicePdf(sale);
    return { buffer, invoiceNumber: sale.invoiceNumber };
  }

  async sendSaleEmail(id: string, pdfBase64?: string): Promise<{ message: string }> {
    const sale = await this.saleRepository.findOne({
      where: { id },
      relations: ['customer', 'details', 'details.product', 'branch', 'payments', 'payments.paymentMethod'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    const email = sale.customer?.email || sale.guestCustomer?.email;

    if (!email) {
      return { message: 'La venta no tiene un correo electrónico asociado' };
    }

    try {
      let pdfBuffer: Buffer;
      if (pdfBase64) {
        pdfBuffer = Buffer.from(pdfBase64, 'base64');
      } else {
        pdfBuffer = await this.pdfService.generateInvoicePdf(sale);
      }

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

  async uploadMediaToMeta(pdfBuffer: Buffer, fileName: string): Promise<string> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      throw new BadRequestException('Las credenciales de WhatsApp no están configuradas');
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    formData.append('file', blob, fileName);
    formData.append('messaging_product', 'whatsapp');

    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Meta Media Upload Error:', errText);
      throw new InternalServerErrorException(`Fallo al subir el ticket a Meta: ${errText}`);
    }

    const result = (await response.json()) as { id: string };
    return result.id;
  }

  async sendSaleWhatsApp(id: string, pdfBase64?: string): Promise<{ message: string }> {
    const sale = await this.saleRepository.findOne({
      where: { id },
      relations: ['customer', 'details', 'details.product', 'branch', 'payments', 'payments.paymentMethod'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    const phone = sale.customer?.phone || sale.guestCustomer?.phone;
    if (!phone) {
      throw new BadRequestException('El cliente no tiene un número de teléfono asociado');
    }

    let cleanPhone = phone.replace(/\D/g, '');
    const defaultPrefix = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '502';
    if (cleanPhone.length === 8) {
      cleanPhone = defaultPrefix + cleanPhone;
    } else if (cleanPhone.length > 0 && !cleanPhone.startsWith(defaultPrefix)) {
      cleanPhone = defaultPrefix + cleanPhone;
    }

    try {
      let pdfBuffer: Buffer;
      if (pdfBase64) {
        pdfBuffer = Buffer.from(pdfBase64, 'base64');
      } else {
        pdfBuffer = await this.pdfService.generateInvoicePdf(sale);
      }

      const mediaId = await this.uploadMediaToMeta(pdfBuffer, `Factura_${sale.invoiceNumber}.pdf`);

      const token = process.env.WHATSAPP_TOKEN;
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const customerName = sale.customer?.name || sale.guestCustomer?.name || 'Cliente';

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'template',
        template: {
          name: 'envio_ticket_pos',
          language: {
            code: 'es_MX',
          },
          components: [
            {
              type: 'header',
              parameters: [
                {
                  type: 'document',
                  document: {
                    id: mediaId,
                    filename: `Factura_${sale.invoiceNumber}.pdf`,
                  },
                },
              ],
            },
            {
              type: 'body',
              parameters: [
                { type: 'text', text: customerName },
                { type: 'text', text: sale.invoiceNumber },
                { type: 'text', text: `${Number(sale.total).toFixed(2)}` },
              ],
            },
          ],
        },
      };

      const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Meta Send Message Error:', errText);
        throw new InternalServerErrorException(`Fallo al enviar el mensaje de WhatsApp: ${errText}`);
      }

      return { message: 'WhatsApp enviado exitosamente' };
    } catch (error) {
      console.error('Error in sendSaleWhatsApp:', error);
      throw error;
    }
  }

  private normalizeWhatsAppPhone(phone: string): string {
    let cleanPhone = phone.replace(/\D/g, '');
    const defaultPrefix = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '502';
    if (cleanPhone.length === 8) {
      cleanPhone = defaultPrefix + cleanPhone;
    } else if (cleanPhone.length > 0 && !cleanPhone.startsWith(defaultPrefix)) {
      cleanPhone = defaultPrefix + cleanPhone;
    }
    return cleanPhone;
  }

  /**
   * Envía recordatorio el día de inicio de cobro (o el primer día que el cron corra después).
   * Plantilla Meta (env WHATSAPP_BILLING_REMINDER_TEMPLATE, default recordatorio_inicio_cobro):
   * body {{1}} nombre, {{2}} número de orden, {{3}} saldo pendiente, {{4}} fecha límite de pago.
   */
  async processBillingStartReminders(): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });

    const sales = await this.saleRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.billingStartDate IS NOT NULL')
      .andWhere('sale.billingReminderSentAt IS NULL')
      .andWhere('sale.pendingAmount > 0')
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('DATE(sale.billing_start_date) <= :today', { today })
      .getMany();

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const sale of sales) {
      const result = await this.sendBillingStartReminder(sale);
      if (result === 'sent') sent++;
      else if (result === 'skipped') skipped++;
      else failed++;
    }

    this.logger.log(
      `Recordatorios de cobro (${today}): ${sales.length} candidatas, ${sent} enviadas, ${skipped} omitidas, ${failed} fallidas`,
    );

    return { scanned: sales.length, sent, skipped, failed };
  }

  private async sendBillingStartReminder(sale: Sale): Promise<'sent' | 'skipped' | 'failed'> {
    const phone = sale.customer?.phone || sale.guestCustomer?.phone;
    if (!phone) {
      this.logger.warn(`Orden ${sale.invoiceNumber}: sin teléfono, se omite el recordatorio`);
      await this.saleRepository.update(sale.id, { billingReminderSentAt: new Date() });
      return 'skipped';
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      this.logger.error('WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID no configurados');
      return 'failed';
    }

    const templateName = process.env.WHATSAPP_BILLING_REMINDER_TEMPLATE || 'recordatorio_inicio_cobro';
    const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_MX';
    const customerName = sale.customer?.name || sale.guestCustomer?.name || 'Cliente';
    const pending = Number(sale.pendingAmount || 0).toFixed(2);
    const dueDate = sale.dueDate
      ? new Date(sale.dueDate).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' })
      : 'por definir';

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizeWhatsAppPhone(phone),
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customerName },
              { type: 'text', text: sale.invoiceNumber },
              { type: 'text', text: pending },
              { type: 'text', text: dueDate },
            ],
          },
        ],
      },
    };

    try {
      const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`WhatsApp recordatorio ${sale.invoiceNumber}: ${errText}`);
        return 'failed';
      }

      await this.saleRepository.update(sale.id, { billingReminderSentAt: new Date() });
      return 'sent';
    } catch (error) {
      this.logger.error(`WhatsApp recordatorio ${sale.invoiceNumber}`, error as Error);
      return 'failed';
    }
  }

  async sendCollectionReminder(id: string, user: any): Promise<{
    message: string;
    saleId: string;
    channel: 'whatsapp';
    to: string;
    sentAt: string;
    lastRemindedAt: string;
  }> {
    const sale = await this.saleRepository.findOne({
      where: { id },
      relations: ['customer', 'branch'],
    });

    if (!sale) {
      throw new NotFoundException('No se encontró la orden.');
    }

    if (!isSuperAdmin(user) && sale.branch?.id !== user?.branch?.id) {
      throw new ForbiddenException('No tiene acceso a esta sucursal.');
    }

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('No se puede recordar una orden cancelada.');
    }

    if (Number(sale.pendingAmount) <= 0) {
      throw new BadRequestException('La orden no tiene saldo pendiente.');
    }

    if (!sale.dueDate) {
      throw new BadRequestException('La orden no tiene límite de pago.');
    }

    const phone = sale.customer?.phone || sale.guestCustomer?.phone;
    if (!phone || !String(phone).trim()) {
      throw new BadRequestException('El cliente no tiene teléfono registrado.');
    }

    if (sale.collectionLastRemindedAt) {
      const elapsed = Date.now() - new Date(sale.collectionLastRemindedAt).getTime();
      if (elapsed < 4 * 60 * 60 * 1000) {
        throw new ConflictException({
          statusCode: 409,
          message: 'Ya se envió un recordatorio hace poco.',
          error: 'Conflict',
          data: { lastRemindedAt: new Date(sale.collectionLastRemindedAt).toISOString() },
        });
      }
    }

    const to = this.normalizeWhatsAppPhone(phone);
    await this.dispatchCollectionReminderWhatsApp(sale, to);

    const sentAt = new Date();
    await this.saleRepository.update(sale.id, { collectionLastRemindedAt: sentAt });
    const sentAtIso = sentAt.toISOString();

    return {
      message: 'Recordatorio enviado',
      saleId: sale.id,
      channel: 'whatsapp',
      to,
      sentAt: sentAtIso,
      lastRemindedAt: sentAtIso,
    };
  }

  private async dispatchCollectionReminderWhatsApp(sale: Sale, to: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      throw new InternalServerErrorException('Las credenciales de WhatsApp no están configuradas');
    }

    const name = sale.customer?.name || sale.guestCustomer?.name || 'Consumidor final';
    const amount = formatCollectionAmount(Number(sale.pendingAmount));
    const dueDate = new Date(sale.dueDate as Date).toLocaleDateString('es-GT', {
      timeZone: 'America/Guatemala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const bodyText = `Hola ${name}, le recordamos el saldo pendiente de ${amount} de la factura #${sale.invoiceNumber}. Límite de pago: ${dueDate}.`;

    const templateName = process.env.WHATSAPP_COLLECTION_REMINDER_TEMPLATE || 'recordatorio_cobro';
    const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_MX';

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: name },
              { type: 'text', text: amount },
              { type: 'text', text: `#${sale.invoiceNumber}. Límite de pago: ${dueDate}` },
            ],
          },
        ],
      },
    };

    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      this.logger.error(`WhatsApp recordatorio cobro ${sale.invoiceNumber}: ${errText}`);
      throw new InternalServerErrorException(`Fallo al enviar el mensaje de WhatsApp: ${errText}`);
    }

    this.logger.log(`Recordatorio de cobro enviado ${sale.invoiceNumber} → ${to} (${bodyText})`);
  }
}

function formatCollectionAmount(amount: number): string {
  const cents = Math.round(amount * 100) % 100;
  const formatted = new Intl.NumberFormat('es-GT', {
    minimumFractionDigits: cents === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `Q${formatted}`;
}
