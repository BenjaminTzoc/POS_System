import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Sale, SaleDetail, SaleStatus } from '../entities';
import { DataSource, IsNull, Like, Repository } from 'typeorm';
import { CustomerService, DiscountCodeService } from '.';
import {
  BranchService,
  InventoryMovementService,
  ProductService,
} from 'src/logistics/services';
import { CreateSaleDto, SaleResponseDto, UpdateSaleDto } from '../dto';
import { plainToInstance } from 'class-transformer';
import {
  Branch,
  Inventory,
  MovementStatus,
  MovementType,
  MovementConcept,
} from 'src/logistics/entities';
import { SaleGateway } from '../gateway/sale.gateway';
import { SaleDiscount } from '../entities/sale-discount.entity';
import { MailService } from 'src/common/mail/mail.service';
import { PdfService } from 'src/common/pdf/pdf.service';

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
    private readonly branchService: BranchService,
    private readonly discountCodeService: DiscountCodeService,
    private readonly productService: ProductService,
    private readonly inventoryMovementService: InventoryMovementService,
    private readonly dataSource: DataSource,
    private readonly saleGateway: SaleGateway,
    private readonly mailService: MailService,
    private readonly pdfService: PdfService,
  ) {}

  async create(dto: CreateSaleDto): Promise<SaleResponseDto> {
    const existingInvoice = await this.saleRepository.findOne({
      where: { invoiceNumber: dto.invoiceNumber },
      withDeleted: false,
    });

    if (existingInvoice)
      throw new ConflictException(`La factura ${dto.invoiceNumber} ya existe`);

    if (dto.customerId && dto.guestCustomer) {
      throw new BadRequestException(
        'No puede proporcionar customerId y guestCustomer al mismo tiempo.',
      );
    }

    if (!dto.customerId && !dto.guestCustomer) {
      throw new BadRequestException(
        'Debe proporcionar customerId o guestCustomer.',
      );
    }

    let customer: any = null;

    if (dto.customerId) {
      try {
        customer = await this.customerService.findOne(dto.customerId);
      } catch {
        throw new BadRequestException(
          `El cliente con ID ${dto.customerId} no existe`,
        );
      }
    }

    const branch = await this.branchRepository.findOne({
      where: { id: dto.branchId, deletedAt: IsNull() },
    });

    if (!branch) {
      throw new BadRequestException('Sucursal no válida.');
    }

    if (!dto.details?.length)
      throw new BadRequestException('La venta debe tener al menos un detalle');

    const stockErrors: string[] = [];

    for (const detailDto of dto.details) {
      const stockQuery = await this.dataSource
        .createQueryBuilder()
        .select([
          'product.id',
          'product.name',
          'COALESCE(SUM(inventory.stock), 0) AS current_stock',
        ])
        .from('products', 'product')
        .leftJoin(
          'inventories',
          'inventory',
          'inventory.product_id = product.id AND inventory.branch_id = :branchId',
          { branchId: dto.branchId },
        )
        .where('product.id = :productId', { productId: detailDto.productId })
        .andWhere('product.deletedAt IS NULL')
        .groupBy('product.id')
        .getRawOne();

      if (!stockQuery) {
        stockErrors.push(
          `Producto con ID ${detailDto.productId} no encontrado`,
        );
        continue;
      }

      const currentStock = Number(stockQuery.current_stock);
      const productName = stockQuery.product_name;

      if (currentStock < detailDto.quantity) {
        stockErrors.push(
          `Producto "${productName}" - Stock insuficiente: solicitado ${detailDto.quantity}, disponible ${currentStock}`,
        );
      }
    }

    if (stockErrors.length > 0) {
      throw new BadRequestException({
        message: 'Error de stock en los productos',
        errors: stockErrors,
      });
    }

    let discountCode: any = null;
    let discountCodeAmount: number = 0;

    if (dto.discountCodeId) {
      discountCode = await this.discountCodeService.findOne(dto.discountCodeId);

      const subtotalPrecalc = dto.details.reduce(
        (sum, d) => sum + d.quantity * d.unitPrice,
        0,
      );

      const validation = await this.discountCodeService.validateDiscountCode(
        discountCode.code,
        dto.customerId,
        undefined,
        subtotalPrecalc,
      );

      if (!validation.isValid) {
        throw new BadRequestException(
          `Código de descuento inválido: ${validation.message}`,
        );
      }

      discountCodeAmount = validation.discountAmount;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Crear venta base
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

        // Se actualizan después
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        paidAmount: 0,
        pendingAmount: 0,
      });

      const savedSale = await qr.manager.save(sale);

      // ---------------- DETALLES ----------------
      let subtotal = 0;
      let taxAmount = 0;
      let lineDiscounts = 0;

      for (const detailDto of dto.details) {
        const product = await this.productService.findOne(detailDto.productId);

        const lineSubtotal = detailDto.quantity * detailDto.unitPrice;
        const lineDiscount = (lineSubtotal * (detailDto.discount || 0)) / 100;
        const lineAfterDiscount = lineSubtotal - lineDiscount;
        const lineTax = sale.applyTax
          ? (lineAfterDiscount * (detailDto.taxPercentage ?? 12)) / 100
          : 0;
        const lineTotal = lineAfterDiscount + lineTax;

        const detail = qr.manager.create(SaleDetail, {
          sale: savedSale,
          product: { id: detailDto.productId },
          quantity: detailDto.quantity,
          unitPrice: detailDto.unitPrice,
          discount: detailDto.discount || 0,
          discountAmount: lineDiscount,
          taxPercentage: sale.applyTax ? (detailDto.taxPercentage ?? 12) : 0,
          taxAmount: lineTax,
          lineTotal,
        });

        await qr.manager.save(detail);

        subtotal += lineSubtotal;
        lineDiscounts += lineDiscount;
        taxAmount += lineTax;
      }

      // ---------------- DESCUENTOS GLOBALES (SaleDiscount) ----------------
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

      // ---------------- TOTAL FINAL ----------------
      const globalDiscounts = manualDiscountsAmount + discountCodeAmount;
      const totalDiscounts = lineDiscounts + globalDiscounts;

      // Escenario 1: El impuesto se calcula sobre el valor NETO (Subtotal - Descuentos)
      // Ajustamos el taxAmount acumulado de las líneas por el factor de descuento global
      const taxableBase = subtotal - lineDiscounts;
      const finalTaxAmount =
        taxableBase > 0
          ? taxAmount * ((taxableBase - globalDiscounts) / taxableBase)
          : 0;

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

  async findAll(branchId?: string): Promise<SaleResponseDto[]> {
    const where: any = { deletedAt: IsNull() };
    if (branchId) {
      where.branch = { id: branchId };
    }

    const sales = await this.saleRepository.find({
      where,
      relations: [
        'customer',
        'customer.category',
        'discountCode',
        'branch',
        'details',
        'details.product',
        'payments',
        'payments.paymentMethod',
      ],
      order: { date: 'DESC', createdAt: 'DESC' },
    });
    return plainToInstance(SaleResponseDto, sales);
  }

  async findOne(id: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: [
        'customer',
        'customer.category',
        'discountCode',
        'branch',
        'details',
        'details.product',
        'details.product.inventories',
        'details.product.inventories.branch',
        'payments',
        'payments.paymentMethod',
        'discounts',
      ],
      order: {
        payments: {
          createdAt: 'DESC',
        },
      },
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    // Calcular el stock para cada producto en la sucursal de la venta
    if (sale.details) {
      sale.details.forEach((detail) => {
        const inventory = detail.product.inventories?.find(
          (inv) => inv.branch?.id === sale.branch?.id,
        );
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
      relations: [
        'customer',
        'customer.category',
        'discountCode',
        'details',
        'details.product',
      ],
      order: { date: 'DESC' },
    });
    return plainToInstance(SaleResponseDto, sales);
  }

  async findByStatus(status: SaleStatus): Promise<SaleResponseDto[]> {
    const sales = await this.saleRepository.find({
      where: { status, deletedAt: IsNull() },
      relations: [
        'customer',
        'customer.category',
        'discountCode',
        'details',
        'details.product',
      ],
      order: { date: 'DESC' },
    });
    return plainToInstance(SaleResponseDto, sales);
  }

  async confirmSale(
    id: string,
    branchId?: string,
    userId?: string,
  ): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['details', 'details.product', 'customer', 'branch'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException(
        'Solo se pueden confirmar ventas pendientes',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Crear movimientos de inventario para cada producto
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
            referenceId: sale.id,
            referenceNumber: sale.invoiceNumber,
            concept: MovementConcept.SALE,
          },
          userId,
          true,
        );
      }

      // Actualizar estado de la venta
      sale.status = SaleStatus.CONFIRMED;
      await queryRunner.manager.save(sale);

      // Actualizar estadísticas del cliente si existe
      if (sale.customer) {
        await this.customerService.updatePurchaseStats(
          sale.customer.id,
          sale.total,
        );

        // Añadir puntos de lealtad
        // if (sale.loyaltyPointsEarned > 0) {
        //   await this.customerService.addLoyaltyPoints(
        //     sale.customer.id,
        //     sale.loyaltyPointsEarned,
        //   );
        // }

        // Redimir puntos si se especificó
        // if (sale.loyaltyPointsRedeemed > 0) {
        //   await this.customerService.redeemLoyaltyPoints(
        //     sale.customer.id,
        //     sale.loyaltyPointsRedeemed,
        //   );
        // }
      }

      // Aplicar código de descuento si existe
      if (sale.discountCode) {
        await this.discountCodeService.applyDiscountCode(
          sale.discountCode.code,
          sale.id,
        );
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
      throw new BadRequestException(
        'Debe confirmar la venta antes de marcarla como entregada',
      );
    }

    sale.status = SaleStatus.DELIVERED;
    await this.saleRepository.save(sale);
    return this.findOne(id);
  }

  async cancelSale(id: string, userId?: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: [
        'customer',
        'details',
        'details.product',
        'branch',
        'discountCode',
      ],
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
      // Si la venta NO estaba pendiente, significa que ya afectó inventario y estadísticas
      if (sale.status !== SaleStatus.PENDING) {
        // 1. Revertir inventario (Crear movimientos de ENTRADA)
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

        // 2. Revertir estadísticas de compra del cliente
        if (sale.customer) {
          await this.customerService.updatePurchaseStats(
            sale.customer.id,
            -sale.total, // Monto negativo para restar
          );
        }

        // 3. Revertir contador de uso del código de descuento
        if (sale.discountCode) {
          await this.discountCodeService.revertDiscountCodeUsage(
            sale.discountCode.code,
          );
        }
      }

      // 4. Cambiar estado a CANCELADO
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
      throw new BadRequestException(
        'Solo se pueden editar ventas en estado PENDIENTE',
      );
    }

    // El estado NO se puede cambiar por aquí
    // El branchId tampoco debería cambiarse si ya tiene movimientos (en este caso solo es cabecera)

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1. Actualizar metadatos básicos
      if (dto.invoiceNumber && dto.invoiceNumber !== sale.invoiceNumber) {
        const existing = await this.saleRepository.findOne({
          where: { invoiceNumber: dto.invoiceNumber, deletedAt: IsNull() },
        });
        if (existing)
          throw new ConflictException(
            `La factura ${dto.invoiceNumber} ya existe`,
          );
        sale.invoiceNumber = dto.invoiceNumber;
      }

      if (dto.date) sale.date = new Date(dto.date);
      if (dto.dueDate !== undefined)
        sale.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (dto.notes !== undefined) sale.notes = dto.notes;
      if (dto.applyTax !== undefined) sale.applyTax = dto.applyTax;

      if (dto.customerId) sale.customer = { id: dto.customerId } as any;
      if (dto.guestCustomer) {
        sale.guestCustomer = dto.guestCustomer;
        sale.customer = null;
      }

      const branchId = dto.branchId || sale.branch.id;

      // 2. Si hay nuevos detalles, procesarlos
      if (dto.details) {
        // Validar stock primero
        const stockErrors: string[] = [];
        for (const det of dto.details) {
          const inventory = await qr.manager.findOne(Inventory, {
            where: { product: { id: det.productId }, branch: { id: branchId } },
          });
          if (!inventory || inventory.stock < det.quantity) {
            stockErrors.push(
              `Stock insuficiente para producto ID ${det.productId}`,
            );
          }
        }
        if (stockErrors.length > 0)
          throw new BadRequestException({
            message: 'Error de stock',
            errors: stockErrors,
          });

        // Borrar detalles antiguos (TypeORM los reemplazará si usamos save con la relación,
        // pero es más seguro manejarlos explícitamente en una edición compleja)
        await qr.manager.delete(SaleDetail, { sale: { id: sale.id } });

        let subtotal = 0;
        let taxAmount = 0;
        let lineDiscounts = 0;
        const newDetails: SaleDetail[] = [];

        for (const detailDto of dto.details) {
          const lineSubtotal = detailDto.quantity * detailDto.unitPrice;
          const lineDiscount = (lineSubtotal * (detailDto.discount || 0)) / 100;
          const lineAfterDiscount = lineSubtotal - lineDiscount;
          const lineTax = sale.applyTax
            ? (lineAfterDiscount * (detailDto.taxPercentage ?? 12)) / 100
            : 0;
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

      // Definir variables para el recalculo de impuestos proporcionales
      const currentLineDiscounts = dto.details
        ? sale.discountAmount
        : sale.discountAmount -
          (sale.discounts?.reduce(
            (acc, d) => acc + Number(d.amountApplied),
            0,
          ) || 0);
      // Nota: En la lógica de update, sale.discountAmount se usa de forma distinta.
      // Vamos a simplificar: extraemos los valores necesarios para el calculo final.
      const baseTaxAmount = sale.taxAmount;
      const baseLineDiscounts = dto.details
        ? sale.discountAmount
        : Number(sale.discountAmount) -
          (sale.discounts?.reduce(
            (acc, d) => acc + Number(d.amountApplied),
            0,
          ) || 0);

      // Corregir los nombres de variables para que coincidan con el bloque final
      const currentTaxAmount = sale.taxAmount;
      const currentLineDiscountsFinal = dto.details
        ? sale.discountAmount
        : Number(sale.discountAmount) -
          (sale.discounts?.reduce(
            (acc, d) => acc + Number(d.amountApplied),
            0,
          ) || 0);

      // 3. Si hay nuevos descuentos globales
      let discountCodeAmount = 0;
      if (sale.discountCode) {
        // Re-validar código de descuento con el nuevo subtotal
        const validation = await this.discountCodeService.validateDiscountCode(
          sale.discountCode.code,
          sale.customer?.id,
          undefined,
          sale.subtotal,
        );
        if (validation.isValid) discountCodeAmount = validation.discountAmount;
      }

      let manualDiscountsAmount = 0;
      if (dto.discounts) {
        await qr.manager.delete(SaleDiscount, { sale: { id: sale.id } });
        const newDiscounts: SaleDiscount[] = [];
        for (const disDto of dto.discounts) {
          const amount =
            disDto.type === 'percent'
              ? sale.subtotal * (disDto.value / 100)
              : disDto.value;

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
        // Si no vienen nuevos, recalculamos los montos de los existentes con el nuevo subtotal
        for (const dis of sale.discounts) {
          if (dis.type === 'percent') {
            dis.amountApplied = sale.subtotal * (dis.value / 100);
          }
          manualDiscountsAmount += dis.amountApplied;
        }
      }

      const globalDiscounts = manualDiscountsAmount + discountCodeAmount;
      const totalDiscounts = currentLineDiscountsFinal + globalDiscounts;

      // Ajuste de Impuestos Proporcional (Escenario 1)
      const taxableBase = sale.subtotal - currentLineDiscountsFinal;
      const finalTaxAmount =
        taxableBase > 0
          ? currentTaxAmount * ((taxableBase - globalDiscounts) / taxableBase)
          : 0;

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

    // Validar que no se pueda eliminar una venta con pagos
    if (sale.payments && sale.payments.length > 0) {
      throw new ConflictException(
        'No se puede eliminar una venta que tiene pagos asociados',
      );
    }

    await this.saleRepository.softRemove(sale);
    return { message: 'Venta eliminada exitosamente' };
  }

  // async getSaleStats(): Promise<{
  //   total: number;
  //   pending: number;
  //   confirmed: number;
  //   cancelled: number;
  //   totalAmount: number;
  //   averageSale: number;
  //   byType: Record<SaleType, number>;
  // }> {
  //   const sales = await this.saleRepository.find({
  //     where: { deletedAt: IsNull() },
  //   });

  //   const stats = {
  //     total: sales.length,
  //     pending: 0,
  //     confirmed: 0,
  //     cancelled: 0,
  //     totalAmount: 0,
  //     averageSale: 0,
  //     byType: {
  //       [SaleType.RETAIL]: 0,
  //       [SaleType.WHOLESALE]: 0,
  //     },
  //   };

  //   sales.forEach((sale) => {
  //     stats.totalAmount += sale.total;
  //     stats.byType[sale.type]++;

  //     switch (sale.status) {
  //       case SaleStatus.PENDING:
  //         stats.pending++;
  //         break;
  //       case SaleStatus.CONFIRMED:
  //         stats.confirmed++;
  //         break;
  //       case SaleStatus.CANCELLED:
  //         stats.cancelled++;
  //         break;
  //     }
  //   });

  //   stats.averageSale = stats.total > 0 ? stats.totalAmount / stats.total : 0;

  //   return stats;
  // }

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
      relations: [
        'customer',
        'details',
        'details.product',
        'branch',
        'payments',
        'payments.paymentMethod',
      ],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    const email = sale.customer?.email || sale.guestCustomer?.email;

    if (!email) {
      throw new BadRequestException(
        'La venta no tiene un correo electrónico asociado',
      );
    }

    try {
      // 1. Generar PDF
      const pdfBuffer = await this.pdfService.generateInvoicePdf(sale);

      // 2. Enviar correo
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
      throw new InternalServerErrorException(
        'Ocurrió un error al procesar o enviar el correo electrónico',
      );
    }
  }
}
