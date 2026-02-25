import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import { CashRegister, CashRegisterStatus } from '../entities/cash-register.entity';
import { OpenCashRegisterDto, CloseCashRegisterDto, CashRegisterResponseDto } from '../dto/cash-register.dto';
import { SalePayment, PaymentStatus } from '../../sales/entities/sale-payment.entity';
import { PaymentMethod } from '../../purchases/entities/payment-method.entity';

@Injectable()
export class CashRegisterService {
  constructor(
    @InjectRepository(CashRegister)
    private readonly cashRegisterRepository: Repository<CashRegister>,
    @InjectRepository(SalePayment)
    private readonly salePaymentRepository: Repository<SalePayment>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
  ) {}

  async open(dto: OpenCashRegisterDto, userId: string): Promise<CashRegisterResponseDto> {
    const openSession = await this.cashRegisterRepository.findOne({
      where: {
        user: { id: userId },
        status: CashRegisterStatus.OPEN,
      },
    });

    if (openSession) {
      throw new ConflictException('Ya tienes una sesión de caja abierta');
    }

    const session = this.cashRegisterRepository.create({
      user: { id: userId },
      branch: { id: dto.branchId },
      openingBalance: dto.openingBalance,
      notes: dto.notes,
      status: CashRegisterStatus.OPEN,
    });

    const savedSession = await this.cashRegisterRepository.save(session);
    return this.mapToDto(savedSession);
  }

  async getStatus(userId: string): Promise<CashRegisterResponseDto | null> {
    const session = await this.cashRegisterRepository.findOne({
      where: {
        user: { id: userId },
        status: CashRegisterStatus.OPEN,
      },
    });

    return session ? this.mapToDto(session) : null;
  }

  async close(id: string, dto: CloseCashRegisterDto, userId: string): Promise<CashRegisterResponseDto> {
    const session = await this.cashRegisterRepository.findOne({
      where: { id, user: { id: userId }, status: CashRegisterStatus.OPEN },
    });

    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada o ya está cerrada');
    }

    const cashMethod = await this.paymentMethodRepository.findOne({
      where: [{ name: 'Efectivo' }, { name: 'EFECTIVO' }, { code: 'CASH' }, { code: 'EFECTIVO' }],
    });

    if (!cashMethod) {
      throw new BadRequestException('No se encontró un método de pago de tipo "Efectivo" en el sistema');
    }

    const salesPayments = await this.salePaymentRepository.find({
      where: {
        date: Between(session.openedAt, new Date()),
        paymentMethod: { id: cashMethod.id },
        status: PaymentStatus.COMPLETED,
        sale: { branch: { id: session.branch.id } },
      },
      relations: ['sale', 'sale.branch'],
    });

    const totalCashSales = salesPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    const totalExpenses = 0;

    const expectedBalance = Number(session.openingBalance) + totalCashSales - totalExpenses;
    const difference = dto.closingBalance - expectedBalance;

    session.closedAt = new Date();
    session.expectedBalance = expectedBalance;
    session.closingBalance = dto.closingBalance;
    session.difference = difference;
    session.status = CashRegisterStatus.CLOSED;
    session.notes = dto.notes || session.notes;

    const savedSession = await this.cashRegisterRepository.save(session);
    return this.mapToDto(savedSession);
  }

  async getHistory(branchId?: string, startDate?: Date, endDate?: Date): Promise<CashRegisterResponseDto[]> {
    const query = this.cashRegisterRepository.createQueryBuilder('session').leftJoinAndSelect('session.user', 'user').leftJoinAndSelect('session.branch', 'branch').orderBy('session.openedAt', 'DESC');

    if (branchId) {
      query.andWhere('branch.id = :branchId', { branchId });
    }

    if (startDate && endDate) {
      query.andWhere('session.openedAt BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    const sessions = await query.getMany();
    return sessions.map((s) => this.mapToDto(s));
  }

  private mapToDto(session: CashRegister): CashRegisterResponseDto {
    return {
      id: session.id,
      userId: session.user.id,
      userName: session.user.name,
      branchId: session.branch.id,
      branchName: session.branch.name,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingBalance: Number(session.openingBalance),
      expectedBalance: Number(session.expectedBalance),
      closingBalance: session.closingBalance ? Number(session.closingBalance) : null,
      difference: session.difference ? Number(session.difference) : null,
      status: session.status,
      notes: session.notes,
    };
  }
}
