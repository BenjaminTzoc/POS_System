import {
  BadRequestException,
  ConflictException,
  Injectable,
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
import { MovementStatus, MovementType } from 'src/logistics/entities';
import { SaleGateway } from '../gateway/sale.gateway';
import { SaleDiscount } from '../entities/sale-discount.entity';

@Injectable()
export class SaleService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,

    private readonly customerService: CustomerService,
    private readonly branchService: BranchService,
    private readonly discountCodeService: DiscountCodeService,
    private readonly productService: ProductService,
    private readonly inventoryMovementService: InventoryMovementService,
    private readonly dataSource: DataSource,
    private readonly saleGateway: SaleGateway,
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

    const branch = await this.branchService.findOne(dto.branchId);
    if (!dto.details?.length)
      throw new BadRequestException('La venta debe tener al menos un detalle');

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
        const lineTax =
          (lineAfterDiscount * (detailDto.taxPercentage || 0)) / 100;
        const lineTotal = lineAfterDiscount + lineTax;

        const detail = qr.manager.create(SaleDetail, {
          sale: savedSale,
          product: { id: detailDto.productId },
          quantity: detailDto.quantity,
          unitPrice: detailDto.unitPrice,
          discount: detailDto.discount || 0,
          discountAmount: lineDiscount,
          taxPercentage: detailDto.taxPercentage || 0,
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
      const totalDiscounts =
        lineDiscounts + manualDiscountsAmount + discountCodeAmount;

      const total = subtotal - totalDiscounts + taxAmount;

      await qr.manager.update(Sale, savedSale.id, {
        subtotal,
        taxAmount,
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

  async findAll(): Promise<SaleResponseDto[]> {
    const sales = await this.saleRepository.find({
      where: { deletedAt: IsNull() },
      relations: [
        'customer',
        'customer.category',
        'discountCode',
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
        'details',
        'details.product',
        'payments',
        'payments.paymentMethod',
      ],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
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

  async confirmSale(id: string, branchId: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['details', 'details.product', 'customer'],
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
        await this.inventoryMovementService.create({
          productId: detail.product.id,
          branchId: branchId,
          quantity: detail.quantity,
          type: MovementType.OUT,
          notes: `Venta ${sale.invoiceNumber}`,
          unitCost: detail.product.cost,
          totalCost: detail.quantity * detail.product.cost,
          status: MovementStatus.COMPLETED,
        });
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

  async cancelSale(id: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'details'],
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
      // Revertir puntos de lealtad si la venta estaba confirmada
      // if (sale.status === SaleStatus.CONFIRMED && sale.customer) {
      //   if (sale.loyaltyPointsEarned > 0) {
      //     await this.customerService.redeemLoyaltyPoints(
      //       sale.customer.id,
      //       sale.loyaltyPointsEarned,
      //     );
      //   }

      //   if (sale.loyaltyPointsRedeemed > 0) {
      //     await this.customerService.addLoyaltyPoints(
      //       sale.customer.id,
      //       sale.loyaltyPointsRedeemed,
      //     );
      //   }
      // }

      // Cancelar la venta
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

  // async update(id: string, dto: UpdateSaleDto): Promise<SaleResponseDto> {
  //   const sale = await this.saleRepository.findOne({
  //     where: { id, deletedAt: IsNull() },
  //   });

  //   if (!sale) {
  //     throw new NotFoundException(`Venta con ID ${id} no encontrada`);
  //   }

  //   // Validar que no se pueda modificar una venta confirmada o cancelada
  //   if (
  //     sale.status === SaleStatus.CONFIRMED ||
  //     sale.status === SaleStatus.CANCELLED
  //   ) {
  //     throw new BadRequestException(
  //       'No se puede modificar una venta confirmada o cancelada',
  //     );
  //   }

  //   // Verificar si el nuevo número de factura ya existe
  //   if (dto.invoiceNumber && dto.invoiceNumber !== sale.invoiceNumber) {
  //     const existingInvoice = await this.saleRepository.findOne({
  //       where: { invoiceNumber: dto.invoiceNumber, deletedAt: IsNull() },
  //     });

  //     if (existingInvoice) {
  //       throw new ConflictException(
  //         `La factura ${dto.invoiceNumber} ya existe`,
  //       );
  //     }
  //   }

  //   Object.assign(sale, {
  //     invoiceNumber: dto.invoiceNumber ?? sale.invoiceNumber,
  //     date: dto.date ? new Date(dto.date) : sale.date,
  //     type: dto.type ?? sale.type,
  //     status: dto.status ?? sale.status,
  //     subtotal: dto.subtotal ?? sale.subtotal,
  //     taxAmount: dto.taxAmount ?? sale.taxAmount,
  //     discountAmount: dto.discountAmount ?? sale.discountAmount,
  //     categoryDiscount: dto.categoryDiscount ?? sale.categoryDiscount,
  //     codeDiscount: dto.codeDiscount ?? sale.codeDiscount,
  //     total: dto.total ?? sale.total,
  //     paidAmount: dto.paidAmount ?? sale.paidAmount,
  //     pendingAmount: dto.pendingAmount ?? sale.pendingAmount,
  //     loyaltyPointsEarned: dto.loyaltyPointsEarned ?? sale.loyaltyPointsEarned,
  //     loyaltyPointsRedeemed:
  //       dto.loyaltyPointsRedeemed ?? sale.loyaltyPointsRedeemed,
  //     notes: dto.notes ?? sale.notes,
  //   });

  //   await this.saleRepository.save(sale);
  //   return this.findOne(id);
  // }

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
}
