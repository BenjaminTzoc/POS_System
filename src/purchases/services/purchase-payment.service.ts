import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentStatus, Purchase, PurchasePayment, PurchaseStatus } from '../entities';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PaymentMethodService, PurchaseService } from '.';
import { CreatePurchasePaymentDto, PurchasePaymentResponseDto, UpdatePurchasePaymentDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class PurchasePaymentService {
  constructor(
    @InjectRepository(PurchasePayment)
    private readonly paymentRepository: Repository<PurchasePayment>,
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    private readonly purchaseService: PurchaseService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePurchasePaymentDto): Promise<PurchasePaymentResponseDto> {
    console.log(dto.amount);
    // Validar que la compra existe
    let purchase;
    try {
      purchase = await this.purchaseService.findOne(dto.purchaseId);
    } catch (error) {
      throw new BadRequestException(`La compra con ID ${dto.purchaseId} no existe`);
    }

    // Validar que el método de pago existe
    let paymentMethod;
    try {
      paymentMethod = await this.paymentMethodService.findOne(dto.paymentMethodId);
    } catch (error) {
      throw new BadRequestException(`El método de pago con ID ${dto.paymentMethodId} no existe`);
    }

    // Validar que el método de pago esté activo
    if (!paymentMethod.isActive) {
      throw new BadRequestException('El método de pago no está activo');
    }

    // Validar que se requiere cuenta bancaria si el método lo requiere
    if (paymentMethod.requiresBankAccount && !dto.bankAccount) {
      throw new BadRequestException('Este método de pago requiere una cuenta bancaria');
    }

    // Validar que el monto no exceda el pendiente
    if (dto.amount > purchase.pendingAmount) {
      throw new BadRequestException(`El monto excede el saldo pendiente de Q${purchase.pendingAmount}`);
    }

    // Validar que la compra no esté cancelada
    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('No se pueden agregar pagos a una compra cancelada');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Crear el pago
      const payment = queryRunner.manager.create(PurchasePayment, {
        purchase: { id: dto.purchaseId },
        paymentMethod: { id: dto.paymentMethodId },
        amount: Number(dto.amount),
        date: new Date(dto.date),
        referenceNumber: dto.referenceNumber,
        bankAccount: dto.bankAccount,
        status: dto.status || PaymentStatus.COMPLETED,
        notes: dto.notes,
      });

      const savedPayment = await queryRunner.manager.save(payment);

      // Actualizar los montos de la compra
      const newPaidAmount = Number(purchase.paidAmount) + Number(dto.amount);
      const newPendingAmount = Number(purchase.total) - newPaidAmount;
      
      const newStatus = this.calculatePurchaseStatus(Number(purchase.total), newPaidAmount);

      await queryRunner.manager.update(Purchase, purchase.id, {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
        status: newStatus,
      });

      await queryRunner.commitTransaction();
      return this.findOne(savedPayment.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(): Promise<PurchasePaymentResponseDto[]> {
    const payments = await this.paymentRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['purchase', 'purchase.supplier', 'paymentMethod'],
      order: { date: 'DESC', createdAt: 'DESC' },
    });
    return plainToInstance(PurchasePaymentResponseDto, payments);
  }

  async findOne(id: string): Promise<PurchasePaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['purchase', 'purchase.supplier', 'paymentMethod'],
    });

    if (!payment) {
      throw new NotFoundException(`Pago con ID ${id} no encontrado`);
    }

    return plainToInstance(PurchasePaymentResponseDto, payment);
  }

  async findByPurchase(purchaseId: string): Promise<PurchasePaymentResponseDto[]> {
    const payments = await this.paymentRepository.find({
      where: { 
        purchase: { id: purchaseId },
        deletedAt: IsNull() 
      },
      relations: ['purchase', 'paymentMethod'],
      order: { date: 'ASC' },
    });
    return plainToInstance(PurchasePaymentResponseDto, payments);
  }

  async findByPaymentMethod(paymentMethodId: string): Promise<PurchasePaymentResponseDto[]> {
    const payments = await this.paymentRepository.find({
      where: { 
        paymentMethod: { id: paymentMethodId },
        deletedAt: IsNull() 
      },
      relations: ['purchase', 'purchase.supplier', 'paymentMethod'],
      order: { date: 'DESC' },
    });
    return plainToInstance(PurchasePaymentResponseDto, payments);
  }

  async findByDateRange(startDate: string, endDate: string): Promise<PurchasePaymentResponseDto[]> {
    const payments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.purchase', 'purchase')
      .leftJoinAndSelect('purchase.supplier', 'supplier')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .where('payment.deletedAt IS NULL')
      .andWhere('payment.date BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      })
      .orderBy('payment.date', 'DESC')
      .getMany();

    return plainToInstance(PurchasePaymentResponseDto, payments);
  }

  async update(id: string, dto: UpdatePurchasePaymentDto): Promise<PurchasePaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['purchase'],
    });

    if (!payment) {
      throw new NotFoundException(`Pago con ID ${id} no encontrado`);
    }

    // Validar que no se pueda modificar un pago cancelado
    if (payment.status === PaymentStatus.CANCELLED) {
      throw new BadRequestException('No se puede modificar un pago cancelado');
    }

    const oldAmount = payment.amount;
    const purchase = payment.purchase;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Revertir el monto anterior
      const temporaryPaidAmount = purchase.paidAmount - oldAmount;
      const temporaryPendingAmount = purchase.total - temporaryPaidAmount;

      // Aplicar el nuevo monto
      const newAmount = dto.amount ?? payment.amount;
      const newPaidAmount = temporaryPaidAmount + newAmount;
      const newPendingAmount = purchase.total - newPaidAmount;

      if (newAmount > (temporaryPendingAmount + oldAmount)) {
        throw new BadRequestException(`El nuevo monto excede el saldo pendiente disponible`);
      }

      // Actualizar el pago
      Object.assign(payment, {
        amount: newAmount,
        date: dto.date ? new Date(dto.date) : payment.date,
        referenceNumber: dto.referenceNumber ?? payment.referenceNumber,
        bankAccount: dto.bankAccount ?? payment.bankAccount,
        status: dto.status ?? payment.status,
        notes: dto.notes ?? payment.notes,
      });

      const updatedPayment = await queryRunner.manager.save(payment);

      // Actualizar la compra
      const newStatus = this.calculatePurchaseStatus(purchase.total, newPaidAmount);

      await queryRunner.manager.update(Purchase, purchase.id, {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
        status: newStatus,
      });

      await queryRunner.commitTransaction();
      return this.findOne(updatedPayment.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async cancel(id: string): Promise<PurchasePaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['purchase'],
    });

    if (!payment) {
      throw new NotFoundException(`Pago con ID ${id} no encontrado`);
    }

    if (payment.status === PaymentStatus.CANCELLED) {
      throw new ConflictException('El pago ya está cancelado');
    }

    const purchase = payment.purchase;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Cancelar el pago
      payment.status = PaymentStatus.CANCELLED;
      await queryRunner.manager.save(payment);

      // Recalcular los montos de la compra
      const newPaidAmount = purchase.paidAmount - payment.amount;
      const newPendingAmount = purchase.total - newPaidAmount;
      const newStatus = this.calculatePurchaseStatus(purchase.total, newPaidAmount);

      await queryRunner.manager.update(Purchase, purchase.id, {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
        status: newStatus,
      });

      await queryRunner.commitTransaction();
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const payment = await this.paymentRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!payment) {
      throw new NotFoundException(`Pago con ID ${id} no encontrado`);
    }

    // No permitir eliminación física, solo cancelación
    throw new BadRequestException('Use el endpoint de cancelación en lugar de eliminar el pago');
  }

  async getPaymentStats(): Promise<{
    totalPayments: number;
    totalAmount: number;
    completedPayments: number;
    cancelledPayments: number;
    byPaymentMethod: Record<string, number>;
  }> {
    const payments = await this.paymentRepository.find({
      where: { deletedAt: IsNull(), status: PaymentStatus.COMPLETED },
      relations: ['paymentMethod'],
    });

    const stats = {
      totalPayments: payments.length,
      totalAmount: 0,
      completedPayments: 0,
      cancelledPayments: 0,
      byPaymentMethod: {},
    };

    payments.forEach(payment => {
      stats.totalAmount += payment.amount;
      
      if (payment.status === PaymentStatus.COMPLETED) {
        stats.completedPayments++;
      } else if (payment.status === PaymentStatus.CANCELLED) {
        stats.cancelledPayments++;
      }

      const methodName = payment.paymentMethod.name;
      stats.byPaymentMethod[methodName] = (stats.byPaymentMethod[methodName] || 0) + payment.amount;
    });

    return stats;
  }

  async getSupplierPayments(supplierId: string): Promise<PurchasePaymentResponseDto[]> {
    const payments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.purchase', 'purchase')
      .leftJoinAndSelect('purchase.supplier', 'supplier')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .where('supplier.id = :supplierId', { supplierId })
      .andWhere('payment.deletedAt IS NULL')
      .andWhere('payment.status = :status', { status: PaymentStatus.COMPLETED })
      .orderBy('payment.date', 'DESC')
      .getMany();

    return plainToInstance(PurchasePaymentResponseDto, payments);
  }

  private calculatePurchaseStatus(total: number, paidAmount: number): PurchaseStatus {
    if (paidAmount === 0) return PurchaseStatus.PENDING;
    if (paidAmount < total) return PurchaseStatus.PARTIALLY_PAID;
    return PurchaseStatus.PAID;
  }
}
