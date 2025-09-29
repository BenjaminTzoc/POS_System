import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Sale, SaleDetail, SaleStatus, SaleType } from '../entities';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CustomerService, DiscountCodeService } from '.';
import { InventoryMovementService, ProductService } from 'src/logistics/services';
import { CreateSaleDto, SaleResponseDto, UpdateSaleDto } from '../dto';
import { plainToInstance } from 'class-transformer';
import { MovementStatus, MovementType } from 'src/logistics/entities';

@Injectable()
export class SaleService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,
    private readonly customerService: CustomerService,
    private readonly discountCodeService: DiscountCodeService,
    private readonly productService: ProductService,
    private readonly inventoryMovementService: InventoryMovementService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSaleDto): Promise<SaleResponseDto> {
    // Verificar si el número de factura ya existe
    const existingInvoice = await this.saleRepository.findOne({
      where: { invoiceNumber: dto.invoiceNumber },
      withDeleted: false,
    });

    if (existingInvoice) {
      throw new ConflictException(`La factura ${dto.invoiceNumber} ya existe`);
    }

    // Validar detalles de la venta
    if (!dto.details || dto.details.length === 0) {
      throw new BadRequestException('La venta debe tener al menos un detalle');
    }

    let customer: any = null;
    let discountCode: any = null;
    let discountValidation: any = null;

    // Validar cliente si se proporciona
    if (dto.customerId) {
      try {
        customer = await this.customerService.findOne(dto.customerId);
      } catch (error) {
        throw new BadRequestException(`El cliente con ID ${dto.customerId} no existe`);
      }
    }

    // Validar código de descuento si se proporciona
    if (dto.discountCodeId) {
      try {
        discountCode = await this.discountCodeService.findOne(dto.discountCodeId);
        
        // Validar el código de descuento para esta venta
        const purchaseAmount = dto.details.reduce((sum, detail) => 
          sum + (detail.quantity * detail.unitPrice), 0
        );
        
        discountValidation = await this.discountCodeService.validateDiscountCode(
          discountCode.code,
          dto.customerId,
          undefined, // productId se valida por detalle
          purchaseAmount
        );

        if (!discountValidation.isValid) {
          throw new BadRequestException(`Código de descuento inválido: ${discountValidation.message}`);
        }
      } catch (error) {
        throw new BadRequestException(`El código de descuento con ID ${dto.discountCodeId} no existe`);
      }
    }

    // Validar puntos de lealtad si se redimen
    if (dto.loyaltyPointsRedeemed && dto.loyaltyPointsRedeemed > 0) {
      if (!customer) {
        throw new BadRequestException('Se requiere un cliente para redimir puntos de lealtad');
      }
      
      if (customer.loyaltyPoints < dto.loyaltyPointsRedeemed) {
        throw new BadRequestException('El cliente no tiene suficientes puntos para redimir');
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Crear la venta
      const sale = queryRunner.manager.create(Sale, {
        invoiceNumber: dto.invoiceNumber,
        date: new Date(dto.date),
        type: dto.type || SaleType.RETAIL,
        status: SaleStatus.PENDING,
        customer: customer ? { id: dto.customerId } : null,
        discountCode: discountCode ? { id: dto.discountCodeId } : null,
        loyaltyPointsRedeemed: dto.loyaltyPointsRedeemed || 0,
        notes: dto.notes,
      });

      const savedSale = await queryRunner.manager.save(sale);

      // Crear detalles de la venta y calcular totales
      let subtotal = 0;
      let taxAmount = 0;
      let discountAmount = 0;

      for (const detailDto of dto.details) {
        // Validar que el producto existe y tiene stock
        let product;
        try {
          product = await this.productService.findOne(detailDto.productId);
        } catch (error) {
          throw new BadRequestException(`El producto con ID ${detailDto.productId} no existe`);
        }

        // Calcular montos del detalle
        const lineSubtotal = detailDto.quantity * detailDto.unitPrice;
        const lineDiscount = detailDto.discountAmount || (lineSubtotal * (detailDto.discount || 0) / 100);
        const lineTax = detailDto.taxAmount || (lineSubtotal * (detailDto.taxPercentage || 0) / 100);
        const lineTotal = lineSubtotal - lineDiscount + lineTax;

        const detail = queryRunner.manager.create(SaleDetail, {
          sale: savedSale,
          product: { id: detailDto.productId },
          quantity: detailDto.quantity,
          unitPrice: detailDto.unitPrice,
          discount: detailDto.discount || 0,
          discountAmount: lineDiscount,
          taxPercentage: detailDto.taxPercentage || 0,
          taxAmount: lineTax,
          lineTotal: lineTotal,
        });

        await queryRunner.manager.save(detail);

        subtotal += lineSubtotal;
        discountAmount += lineDiscount;
        taxAmount += lineTax;
      }

      // Calcular descuentos adicionales
      let categoryDiscount = 0;
      let codeDiscount = discountValidation?.discountAmount || 0;

      // Aplicar descuento de categoría si hay cliente con categoría
      if (customer?.category?.discountPercentage) {
        categoryDiscount = subtotal * (customer.category.discountPercentage / 100);
      }

      // Calcular total final
      const total = subtotal - discountAmount - categoryDiscount - codeDiscount + taxAmount;

      // Calcular puntos de lealtad ganados (1 punto por cada Q10 de compra)
      const loyaltyPointsEarned = Math.floor(total / 10);

      // Actualizar la venta con los totales calculados
      await queryRunner.manager.update(Sale, savedSale.id, {
        subtotal,
        taxAmount,
        discountAmount,
        categoryDiscount,
        codeDiscount,
        total,
        pendingAmount: total,
        loyaltyPointsEarned,
      });

      await queryRunner.commitTransaction();
      return this.findOne(savedSale.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
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
        'payments.paymentMethod'
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
        'payments.paymentMethod'
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
        deletedAt: IsNull() 
      },
      relations: [
        'customer', 
        'customer.category', 
        'discountCode', 
        'details', 
        'details.product'
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
        'details.product'
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
      throw new BadRequestException('Solo se pueden confirmar ventas pendientes');
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
        await this.customerService.updatePurchaseStats(sale.customer.id, sale.total);
        
        // Añadir puntos de lealtad
        if (sale.loyaltyPointsEarned > 0) {
          await this.customerService.addLoyaltyPoints(sale.customer.id, sale.loyaltyPointsEarned);
        }

        // Redimir puntos si se especificó
        if (sale.loyaltyPointsRedeemed > 0) {
          await this.customerService.redeemLoyaltyPoints(sale.customer.id, sale.loyaltyPointsRedeemed);
        }
      }

      // Aplicar código de descuento si existe
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
      if (sale.status === SaleStatus.CONFIRMED && sale.customer) {
        if (sale.loyaltyPointsEarned > 0) {
          await this.customerService.redeemLoyaltyPoints(sale.customer.id, sale.loyaltyPointsEarned);
        }
        
        if (sale.loyaltyPointsRedeemed > 0) {
          await this.customerService.addLoyaltyPoints(sale.customer.id, sale.loyaltyPointsRedeemed);
        }
      }

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

  async update(id: string, dto: UpdateSaleDto): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    // Validar que no se pueda modificar una venta confirmada o cancelada
    if (sale.status === SaleStatus.CONFIRMED || sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('No se puede modificar una venta confirmada o cancelada');
    }

    // Verificar si el nuevo número de factura ya existe
    if (dto.invoiceNumber && dto.invoiceNumber !== sale.invoiceNumber) {
      const existingInvoice = await this.saleRepository.findOne({
        where: { invoiceNumber: dto.invoiceNumber, deletedAt: IsNull() },
      });

      if (existingInvoice) {
        throw new ConflictException(`La factura ${dto.invoiceNumber} ya existe`);
      }
    }

    Object.assign(sale, {
      invoiceNumber: dto.invoiceNumber ?? sale.invoiceNumber,
      date: dto.date ? new Date(dto.date) : sale.date,
      type: dto.type ?? sale.type,
      status: dto.status ?? sale.status,
      subtotal: dto.subtotal ?? sale.subtotal,
      taxAmount: dto.taxAmount ?? sale.taxAmount,
      discountAmount: dto.discountAmount ?? sale.discountAmount,
      categoryDiscount: dto.categoryDiscount ?? sale.categoryDiscount,
      codeDiscount: dto.codeDiscount ?? sale.codeDiscount,
      total: dto.total ?? sale.total,
      paidAmount: dto.paidAmount ?? sale.paidAmount,
      pendingAmount: dto.pendingAmount ?? sale.pendingAmount,
      loyaltyPointsEarned: dto.loyaltyPointsEarned ?? sale.loyaltyPointsEarned,
      loyaltyPointsRedeemed: dto.loyaltyPointsRedeemed ?? sale.loyaltyPointsRedeemed,
      notes: dto.notes ?? sale.notes,
    });

    await this.saleRepository.save(sale);
    return this.findOne(id);
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
      throw new ConflictException('No se puede eliminar una venta que tiene pagos asociados');
    }

    await this.saleRepository.softRemove(sale);
    return { message: 'Venta eliminada exitosamente' };
  }

  async getSaleStats(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    totalAmount: number;
    averageSale: number;
    byType: Record<SaleType, number>;
  }> {
    const sales = await this.saleRepository.find({
      where: { deletedAt: IsNull() },
    });

    const stats = {
      total: sales.length,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
      totalAmount: 0,
      averageSale: 0,
      byType: {
        [SaleType.RETAIL]: 0,
        [SaleType.WHOLESALE]: 0,
      },
    };

    sales.forEach(sale => {
      stats.totalAmount += sale.total;
      stats.byType[sale.type]++;

      switch (sale.status) {
        case SaleStatus.PENDING:
          stats.pending++;
          break;
        case SaleStatus.CONFIRMED:
          stats.confirmed++;
          break;
        case SaleStatus.CANCELLED:
          stats.cancelled++;
          break;
      }
    });

    stats.averageSale = stats.total > 0 ? stats.totalAmount / stats.total : 0;

    return stats;
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
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .orderBy('sale.date', 'DESC')
      .getMany();

    return plainToInstance(SaleResponseDto, sales);
  }
}
