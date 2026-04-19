import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentMethodService } from 'src/purchases/services';
import { BankAccountService } from 'src/finances/services/bank-account.service';
import { Repository, DataSource, IsNull } from 'typeorm';
import { SalePayment, Sale, SaleStatus, PaymentStatus } from '../entities';
import { SaleService } from '.';
import { CreateSalePaymentDto, SalePaymentResponseDto, UpdateSalePaymentDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class SalePaymentService {
  constructor(
    @InjectRepository(SalePayment)
    private readonly paymentRepository: Repository<SalePayment>,
    private readonly saleService: SaleService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly bankAccountService: BankAccountService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSalePaymentDto): Promise<SalePaymentResponseDto> {
    let sale;
    try {
      sale = await this.saleService.findOne(dto.saleId);
    } catch (error) {
      throw new BadRequestException(`La venta con ID ${dto.saleId} no existe`);
    }

    let paymentMethod;
    try {
      paymentMethod = await this.paymentMethodService.findOne(dto.paymentMethodId);
    } catch (error) {
      throw new BadRequestException(`El método de pago con ID ${dto.paymentMethodId} no existe`);
    }


    if (paymentMethod.requiresBankAccount && !dto.bankAccountId && !dto.manualBankAccount) {
      throw new BadRequestException('Este método de pago requiere una cuenta bancaria (catálogo) o manual');
    }

    if (dto.bankAccountId) {
      await this.bankAccountService.findOne(dto.bankAccountId);
    }

    if (sale.status === SaleStatus.PENDING && !dto.isDownPayment) {
      try {
        const branchId = sale.branch?.id;
        if (!branchId) {
          throw new BadRequestException('La venta no tiene una sucursal asociada');
        }

        await this.saleService.confirmSale(sale.id, branchId);

        sale = await this.saleService.findOne(dto.saleId);
      } catch (error) {
        throw new BadRequestException('No se pudo confirmar la venta antes de registrar el pago: ' + error.message);
      }
    }

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('No se pueden agregar pagos a una venta cancelada');
    }

    if (dto.amount > sale.pendingAmount) {
      throw new BadRequestException(`El monto excede el saldo pendiente de Q${sale.pendingAmount}`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const payment = queryRunner.manager.create(SalePayment, {
        sale: { id: dto.saleId },
        paymentMethod: { id: dto.paymentMethodId },
        amount: Number(dto.amount),
        date: new Date(dto.date),
        referenceNumber: dto.referenceNumber,
        bankAccount: dto.bankAccountId ? { id: dto.bankAccountId } : null,
        manualBankAccount: dto.manualBankAccount,
        status: dto.status || PaymentStatus.COMPLETED,
        isDownPayment: !!dto.isDownPayment,
        notes: dto.notes,
      });

      const savedPayment = await queryRunner.manager.save(payment);

      const newPaidAmount = Number(sale.paidAmount) + Number(dto.amount);
      const newPendingAmount = Number(sale.total) - Number(newPaidAmount);

      await queryRunner.manager.update(Sale, sale.id, {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
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

  async findAll(): Promise<SalePaymentResponseDto[]> {
    const payments = await this.paymentRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['sale', 'sale.customer', 'paymentMethod'],
      order: { date: 'DESC', createdAt: 'DESC' },
    });
    return plainToInstance(SalePaymentResponseDto, payments);
  }

  async findOne(id: string): Promise<SalePaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['sale', 'sale.customer', 'paymentMethod'],
    });

    if (!payment) {
      throw new NotFoundException(`Pago con ID ${id} no encontrado`);
    }

    return plainToInstance(SalePaymentResponseDto, payment);
  }

  async findBySale(saleId: string): Promise<SalePaymentResponseDto[]> {
    const payments = await this.paymentRepository.find({
      where: {
        sale: { id: saleId },
        deletedAt: IsNull(),
      },
      relations: ['sale', 'paymentMethod'],
      order: { date: 'ASC' },
    });
    return plainToInstance(SalePaymentResponseDto, payments);
  }

  async findByPaymentMethod(paymentMethodId: string): Promise<SalePaymentResponseDto[]> {
    const payments = await this.paymentRepository.find({
      where: {
        paymentMethod: { id: paymentMethodId },
        deletedAt: IsNull(),
      },
      relations: ['sale', 'sale.customer', 'paymentMethod'],
      order: { date: 'DESC' },
    });
    return plainToInstance(SalePaymentResponseDto, payments);
  }

  async findByDateRange(startDate: string, endDate: string): Promise<SalePaymentResponseDto[]> {
    const payments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.sale', 'sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .where('payment.deletedAt IS NULL')
      .andWhere('payment.status = :status', { status: PaymentStatus.COMPLETED })
      .andWhere('payment.date BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      })
      .orderBy('payment.date', 'DESC')
      .getMany();

    return plainToInstance(SalePaymentResponseDto, payments);
  }

  async update(id: string, dto: UpdateSalePaymentDto): Promise<SalePaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['sale'],
    });

    if (!payment) {
      throw new NotFoundException(`Pago con ID ${id} no encontrado`);
    }

    if (payment.status === PaymentStatus.CANCELLED) {
      throw new BadRequestException('No se puede modificar un pago cancelado');
    }

    const oldAmount = payment.amount;
    const sale = payment.sale;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const temporaryPaidAmount = sale.paidAmount - oldAmount;
      const temporaryPendingAmount = sale.total - temporaryPaidAmount;

      const newAmount = dto.amount ?? payment.amount;
      const newPaidAmount = temporaryPaidAmount + newAmount;
      const newPendingAmount = sale.total - newPaidAmount;

      if (newAmount > temporaryPendingAmount + oldAmount) {
        throw new BadRequestException(`El nuevo monto excede el saldo pendiente disponible`);
      }

      Object.assign(payment, {
        amount: newAmount,
        date: dto.date ? new Date(dto.date) : payment.date,
        referenceNumber: dto.referenceNumber ?? payment.referenceNumber,
        bankAccount: dto.bankAccountId ? { id: dto.bankAccountId } : payment.bankAccount,
        manualBankAccount: dto.manualBankAccount ?? payment.manualBankAccount,
        status: dto.status ?? payment.status,
        notes: dto.notes ?? payment.notes,
      });

      const updatedPayment = await queryRunner.manager.save(payment);

      await queryRunner.manager.update(Sale, sale.id, {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
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

  async cancel(id: string): Promise<SalePaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['sale'],
    });

    if (!payment) {
      throw new NotFoundException(`Pago con ID ${id} no encontrado`);
    }

    if (payment.status === PaymentStatus.CANCELLED) {
      throw new ConflictException('El pago ya está cancelado');
    }

    const sale = payment.sale;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      payment.status = PaymentStatus.CANCELLED;
      await queryRunner.manager.save(payment);

      const newPaidAmount = sale.paidAmount - payment.amount;
      const newPendingAmount = sale.total - newPaidAmount;

      await queryRunner.manager.update(Sale, sale.id, {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
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

    throw new BadRequestException('Use el endpoint de cancelación en lugar de eliminar el pago');
  }

  async getPaymentStats(): Promise<{
    totalPayments: number;
    totalAmount: number;
    completedPayments: number;
    cancelledPayments: number;
    byPaymentMethod: Record<string, number>;
    averagePayment: number;
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
      averagePayment: 0,
    };

    payments.forEach((payment) => {
      stats.totalAmount += payment.amount;

      if (payment.status === PaymentStatus.COMPLETED) {
        stats.completedPayments++;
      } else if (payment.status === PaymentStatus.CANCELLED) {
        stats.cancelledPayments++;
      }

      const methodName = payment.paymentMethod.name;
      stats.byPaymentMethod[methodName] = (stats.byPaymentMethod[methodName] || 0) + payment.amount;
    });

    stats.averagePayment = stats.totalPayments > 0 ? stats.totalAmount / stats.totalPayments : 0;

    return stats;
  }

  async getDailyPayments(date: string): Promise<{
    date: string;
    total: number;
    payments: SalePaymentResponseDto[];
  }> {
    const targetDate = new Date(date);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const payments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.sale', 'sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .where('payment.deletedAt IS NULL')
      .andWhere('payment.status = :status', { status: PaymentStatus.COMPLETED })
      .andWhere('payment.date >= :startDate AND payment.date < :endDate', {
        startDate: targetDate,
        endDate: nextDate,
      })
      .orderBy('payment.date', 'DESC')
      .getMany();

    const total = payments.reduce((sum, payment) => sum + payment.amount, 0);

    return {
      date,
      total: Number(total.toFixed(2)),
      payments: plainToInstance(SalePaymentResponseDto, payments),
    };
  }

  async getCustomerPayments(customerId: string): Promise<SalePaymentResponseDto[]> {
    const payments = await this.paymentRepository.createQueryBuilder('payment').leftJoinAndSelect('payment.sale', 'sale').leftJoinAndSelect('sale.customer', 'customer').leftJoinAndSelect('payment.paymentMethod', 'paymentMethod').where('customer.id = :customerId', { customerId }).andWhere('payment.deletedAt IS NULL').andWhere('payment.status = :status', { status: PaymentStatus.COMPLETED }).orderBy('payment.date', 'DESC').getMany();

    return plainToInstance(SalePaymentResponseDto, payments);
  }

  async createPartialPayment(
    saleId: string,
    payments: Array<{
      paymentMethodId: string;
      amount: number;
      referenceNumber?: string;
      bankAccountId?: string;
      manualBankAccount?: string;
    }>,
  ): Promise<SalePaymentResponseDto[]> {
    const sale = await this.saleService.findOne(saleId);

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('No se pueden agregar pagos a una venta cancelada');
    }

    const totalPaymentAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

    if (totalPaymentAmount > sale.pendingAmount) {
      throw new BadRequestException(`El monto total de pagos excede el saldo pendiente de Q${sale.pendingAmount}`);
    }

    const createdPayments: SalePaymentResponseDto[] = [];
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const paymentData of payments) {
        const payment = queryRunner.manager.create(SalePayment, {
          sale: { id: saleId },
          paymentMethod: { id: paymentData.paymentMethodId },
          amount: paymentData.amount,
          date: new Date(),
          referenceNumber: paymentData.referenceNumber,
          bankAccount: paymentData.bankAccountId ? { id: paymentData.bankAccountId } : null,
          manualBankAccount: paymentData.manualBankAccount,
          status: PaymentStatus.COMPLETED,
        });

        const savedPayment = await queryRunner.manager.save(payment);
        createdPayments.push(plainToInstance(SalePaymentResponseDto, savedPayment));
      }

      const newPaidAmount = sale.paidAmount + totalPaymentAmount;
      const newPendingAmount = sale.total - newPaidAmount;

      await queryRunner.manager.update(Sale, saleId, {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
      });

      await queryRunner.commitTransaction();
      return createdPayments;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
