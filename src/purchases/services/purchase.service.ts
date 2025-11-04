import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Purchase, PurchaseDetail, PurchaseStatus } from '../entities';
import { DataSource, IsNull, Like, Repository } from 'typeorm';
import { SupplierService } from '.';
import { InventoryMovementService, ProductService } from 'src/logistics/services';
import { CreatePurchaseDto, PurchaseResponseDto, UpdatePurchaseDto } from '../dto';
import { plainToInstance } from 'class-transformer';
import { MovementStatus, MovementType } from 'src/logistics/entities/inventory-movement.entity';
import { PurchaseGateway } from '../gateway/purchase.gateway';

@Injectable()
export class PurchaseService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,

    private readonly supplierService: SupplierService,
    private readonly productService: ProductService,
    private readonly inventoryMovementService: InventoryMovementService,
    private readonly dataSource: DataSource,
    private readonly purchaseGateway: PurchaseGateway,
  ) {}

  async create(dto: CreatePurchaseDto): Promise<PurchaseResponseDto> {
    // Verificar si el número de factura ya existe
    const existingInvoice = await this.purchaseRepository.findOne({
      where: { invoiceNumber: dto.invoiceNumber },
      withDeleted: false,
    });

    if (existingInvoice) {
      throw new ConflictException(`La factura ${dto.invoiceNumber} ya existe`);
    }

    // Validar que el proveedor existe
    let supplier;
    try {
      supplier = await this.supplierService.findOne(dto.supplierId);
    } catch (error) {
      throw new BadRequestException(`El proveedor con ID ${dto.supplierId} no existe`);
    }

    // Validar detalles de la compra
    if (!dto.details || dto.details.length === 0) {
      throw new BadRequestException('La compra debe tener al menos un detalle');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const purchase = queryRunner.manager.create(Purchase, {
        invoiceNumber: dto.invoiceNumber,
        date: new Date(dto.date),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : new Date(),
        supplier: { id: dto.supplierId },
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        paidAmount: 0,
        pendingAmount: 0,
        notes: dto.notes,
        status: PurchaseStatus.PENDING,
      });

      const savedPurchase = await queryRunner.manager.save(purchase);

      let subtotal = 0;
      let taxAmount = 0;
      let discountAmount = 0;

      for (const detailDto of dto.details) {
        let product;
        try {
          product = await this.productService.findOne(detailDto.productId);
        } catch (error) {
          throw new BadRequestException(`El producto con ID ${detailDto.productId} no existe`);
        }

        // Calcular montos del detalle
        const lineSubtotal = detailDto.quantity * detailDto.unitPrice;
        const lineDiscount = lineSubtotal * (detailDto.discount || 0) / 100;
        const subtotalAfterDiscount = lineSubtotal - lineDiscount;
        const lineTax = subtotalAfterDiscount * (detailDto.taxPercentage || 0) / 100;
        const lineTotal = subtotalAfterDiscount + lineTax;

        const detail = queryRunner.manager.create(PurchaseDetail, {
          purchase: savedPurchase,
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

      const total = subtotal - discountAmount + taxAmount;
      
      await queryRunner.manager.update(Purchase, savedPurchase.id, {
        subtotal,
        discountAmount,
        taxAmount,
        total,
        pendingAmount: total,
      });

      await queryRunner.commitTransaction();

      const completePurchase = await this.findOne(savedPurchase.id);

      this.purchaseGateway.notifyNewPurchase(completePurchase);

      const nextNumber = await this.generateNextInvoiceNumber();
      this.purchaseGateway.broadcastNextInvoiceNumber(nextNumber.nextNumber);

      return completePurchase;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(): Promise<PurchaseResponseDto[]> {
    const purchases = await this.purchaseRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['supplier', 'details', 'details.product', 'payments', 'payments.paymentMethod'],
      order: { date: 'DESC', createdAt: 'DESC' },
    });
    return plainToInstance(PurchaseResponseDto, purchases);
  }

  async findOne(id: string): Promise<PurchaseResponseDto> {
    const purchase = await this.purchaseRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['supplier', 'details', 'details.product', 'payments', 'payments.paymentMethod'],
    });

    if (!purchase) {
      throw new NotFoundException(`Compra con ID ${id} no encontrada`);
    }

    return plainToInstance(PurchaseResponseDto, purchase);
  }

  async findBySupplier(supplierId: string): Promise<PurchaseResponseDto[]> {
    const purchases = await this.purchaseRepository.find({
      where: { 
        supplier: { id: supplierId },
        deletedAt: IsNull() 
      },
      relations: ['supplier', 'details', 'details.product', 'payments'],
      order: { date: 'DESC' },
    });
    return plainToInstance(PurchaseResponseDto, purchases);
  }

  async findByStatus(status: PurchaseStatus): Promise<PurchaseResponseDto[]> {
    const purchases = await this.purchaseRepository.find({
      where: { status, deletedAt: IsNull() },
      relations: ['supplier', 'details', 'details.product', 'payments'],
      order: { date: 'DESC' },
    });
    return plainToInstance(PurchaseResponseDto, purchases);
  }

  async update(id: string, dto: UpdatePurchaseDto): Promise<PurchaseResponseDto> {
    const purchase = await this.purchaseRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!purchase) {
      throw new NotFoundException(`Compra con ID ${id} no encontrada`);
    }

    // Validar que no se pueda modificar una compra pagada o cancelada
    if (purchase.status === PurchaseStatus.PAID || purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('No se puede modificar una compra pagada o cancelada');
    }

    // Verificar si el nuevo número de factura ya existe
    if (dto.invoiceNumber && dto.invoiceNumber !== purchase.invoiceNumber) {
      const existingInvoice = await this.purchaseRepository.findOne({
        where: { invoiceNumber: dto.invoiceNumber, deletedAt: IsNull() },
      });

      if (existingInvoice) {
        throw new ConflictException(`La factura ${dto.invoiceNumber} ya existe`);
      }
    }

    Object.assign(purchase, {
      invoiceNumber: dto.invoiceNumber ?? purchase.invoiceNumber,
      date: dto.date ? new Date(dto.date) : purchase.date,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : purchase.dueDate,
      status: dto.status ?? purchase.status,
      subtotal: dto.subtotal ?? purchase.subtotal,
      taxAmount: dto.taxAmount ?? purchase.taxAmount,
      discountAmount: dto.discountAmount ?? purchase.discountAmount,
      total: dto.total ?? purchase.total,
      paidAmount: dto.paidAmount ?? purchase.paidAmount,
      pendingAmount: dto.pendingAmount ?? purchase.pendingAmount,
      notes: dto.notes ?? purchase.notes,
    });

    // Actualizar estado automáticamente según el monto pagado
    if (dto.paidAmount !== undefined) {
      purchase.status = this.calculatePurchaseStatus(purchase.total, dto.paidAmount);
    }

    await this.purchaseRepository.save(purchase);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const purchase = await this.purchaseRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['payments'],
    });

    if (!purchase) {
      throw new NotFoundException(`Compra con ID ${id} no encontrada`);
    }

    // Validar que no se pueda eliminar una compra con pagos
    if (purchase.payments && purchase.payments.length > 0) {
      throw new ConflictException('No se puede eliminar una compra que tiene pagos asociados');
    }

    await this.purchaseRepository.softRemove(purchase);
    return { message: 'Compra eliminada exitosamente' };
  }

  async cancel(id: string): Promise<PurchaseResponseDto> {
    const purchase = await this.purchaseRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!purchase) {
      throw new NotFoundException(`Compra con ID ${id} no encontrada`);
    }

    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new ConflictException('La compra ya está cancelada');
    }

    purchase.status = PurchaseStatus.CANCELLED;
    await this.purchaseRepository.save(purchase);

    return this.findOne(id);
  }

  async receivePurchase(id: string, branchId: string): Promise<PurchaseResponseDto> {
    const purchase = await this.purchaseRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['details', 'details.product'],
    });

    if (!purchase) {
      throw new NotFoundException(`Compra con ID ${id} no encontrada`);
    }

    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('No se puede recibir una compra cancelada');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Crear movimientos de inventario para cada producto
      for (const detail of purchase.details) {
        await this.inventoryMovementService.create({
          productId: detail.product.id,
          branchId: branchId,
          quantity: detail.quantity,
          type: MovementType.IN,
          notes: `Recepción de compra ${purchase.invoiceNumber}`,
          unitCost: detail.unitPrice,
          totalCost: detail.quantity * detail.unitPrice,
          status: MovementStatus.COMPLETED, // Se recibe inmediatamente
        });
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

  async getPurchaseStats(): Promise<{
    total: number;
    pending: number;
    partiallyPaid: number;
    paid: number;
    cancelled: number;
    totalAmount: number;
    pendingAmount: number;
  }> {
    const purchases = await this.purchaseRepository.find({
      where: { deletedAt: IsNull() },
    });

    const stats = {
      total: purchases.length,
      pending: 0,
      partiallyPaid: 0,
      paid: 0,
      cancelled: 0,
      totalAmount: 0,
      pendingAmount: 0,
    };

    purchases.forEach(purchase => {
      stats.totalAmount = Number(stats.totalAmount) + Number(purchase.total);
      stats.pendingAmount = Number(stats.pendingAmount) + Number(purchase.pendingAmount);

      switch (purchase.status) {
        case PurchaseStatus.PENDING:
          stats.pending++;
          break;
        case PurchaseStatus.PARTIALLY_PAID:
          stats.partiallyPaid++;
          break;
        case PurchaseStatus.PAID:
          stats.paid++;
          break;
        case PurchaseStatus.CANCELLED:
          stats.cancelled++;
          break;
      }
    });

    return stats;
  }

  private calculatePurchaseStatus(total: number, paidAmount: number): PurchaseStatus {
    if (paidAmount === 0) return PurchaseStatus.PENDING;
    if (paidAmount < total) return PurchaseStatus.PARTIALLY_PAID;
    if (paidAmount >= total) return PurchaseStatus.PAID;
    return PurchaseStatus.PENDING;
  }

  async generateNextInvoiceNumber(): Promise<{ nextNumber: string }> {
    const currentYear = new Date().getFullYear();

    const lastInvoice = await this.purchaseRepository.findOne({
      where: {
        invoiceNumber: Like(`ORD-${currentYear}-%`)
      },
      order: { invoiceNumber: 'DESC' },
      withDeleted: false
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

    this.purchaseGateway.broadcastNextInvoiceNumber(nextNumber)
    
    return { nextNumber };
  }
}
