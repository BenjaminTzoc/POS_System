import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentStatus, SalePayment, SaleStatus } from '../../sales/entities';
import { Branch } from '../../logistics/entities';
import { TodayPaymentItemDto, TodayPaymentMethodCode, TodayPaymentsDto } from '../dto/today-payments.dto';

const TZ = 'America/Guatemala';
const GUEST_NAME = 'Consumidor final';

@Injectable()
export class TodayPaymentsService {
  constructor(
    @InjectRepository(SalePayment)
    private readonly paymentRepository: Repository<SalePayment>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async getTodayPayments(branchId?: string, limit = 50): Promise<TodayPaymentsDto> {
    if (branchId) {
      const branch = await this.branchRepository.findOne({ where: { id: branchId } });
      if (!branch) throw new BadRequestException('branchId inexistente');
    }

    const date = civilToday();
    const { start, end } = dayBounds(date);

    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.sale', 'sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('sale.branch', 'branch')
      .leftJoinAndSelect('payment.paymentMethod', 'method')
      .leftJoinAndSelect('payment.bankAccount', 'bankAccount')
      .where('payment.deletedAt IS NULL')
      .andWhere('payment.status = :completed', { completed: PaymentStatus.COMPLETED })
      .andWhere('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('payment.date BETWEEN :start AND :end', { start, end });

    if (branchId) qb.andWhere('sale.branch_id = :branchId', { branchId });

    const todayPayments = await qb.getMany();
    const counted = todayPayments.filter((p) => classifyMethod(p) !== 'credit');

    const remainingByPaymentId = await this.remainingAfterEachPayment(counted);

    const items: TodayPaymentItemDto[] = counted
      .map((payment) => this.toItem(payment, remainingByPaymentId.get(payment.id) ?? 0))
      .sort((a, b) => {
        const byDate = new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime();
        if (byDate !== 0) return byDate;
        return b.id.localeCompare(a.id);
      });

    const summary = {
      total: 0,
      count: items.length,
      cash: 0,
      transfer: 0,
      other: 0,
      settled: 0,
    };

    for (const item of items) {
      summary.total = round2(summary.total + item.amount);
      if (item.methodCode === 'cash') summary.cash = round2(summary.cash + item.amount);
      else if (item.methodCode === 'transfer') summary.transfer = round2(summary.transfer + item.amount);
      else summary.other = round2(summary.other + item.amount);
      if (item.remainingBalance === 0) summary.settled += 1;
    }

    return {
      date,
      currency: 'GTQ',
      summary,
      payments: items.slice(0, limit),
    };
  }

  private async remainingAfterEachPayment(todayPayments: SalePayment[]) {
    const map = new Map<string, number>();
    const saleIds = [...new Set(todayPayments.map((p) => p.sale?.id).filter(Boolean))];
    if (saleIds.length === 0) return map;

    const allPayments = await this.paymentRepository
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.sale', 'sale')
      .where('payment.deletedAt IS NULL')
      .andWhere('payment.status = :completed', { completed: PaymentStatus.COMPLETED })
      .andWhere('sale.id IN (:...saleIds)', { saleIds })
      .orderBy('payment.date', 'ASC')
      .addOrderBy('payment.createdAt', 'ASC')
      .getMany();

    const bySale = new Map<string, SalePayment[]>();
    for (const payment of allPayments) {
      const saleId = payment.sale?.id;
      if (!saleId) continue;
      if (!bySale.has(saleId)) bySale.set(saleId, []);
      bySale.get(saleId)!.push(payment);
    }

    const todayIds = new Set(todayPayments.map((p) => p.id));

    for (const payment of todayPayments) {
      const saleId = payment.sale.id;
      const ordered = (bySale.get(saleId) || []).slice().sort((a, b) => {
        const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (byDate !== 0) return byDate;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      let remaining = round2(Number(payment.sale.total) || 0);
      for (const p of ordered) {
        remaining = round2(Math.max(0, remaining - Number(p.amount || 0)));
        if (p.id === payment.id && todayIds.has(p.id)) {
          map.set(p.id, remaining);
          break;
        }
      }
      if (!map.has(payment.id)) {
        map.set(payment.id, round2(Number(payment.sale.pendingAmount) || 0));
      }
    }

    return map;
  }

  private toItem(payment: SalePayment, remainingBalance: number): TodayPaymentItemDto {
    const method = classifyMethod(payment);
    const methodCode: TodayPaymentMethodCode = method === 'credit' ? 'other' : method;
    const paidAtDate = paidAtSource(payment);

    return {
      id: payment.id,
      saleId: payment.sale.id,
      invoiceNumber: payment.sale.invoiceNumber,
      customerName: payment.sale.customer?.name || payment.sale.guestCustomer?.name || GUEST_NAME,
      customerId: payment.sale.customer?.id ?? null,
      amount: round2(Number(payment.amount) || 0),
      remainingBalance,
      methodCode,
      methodName: payment.paymentMethod?.name || methodCode,
      paidAt: paidAtDate.toISOString(),
      time: formatTimeGt(paidAtDate),
      reference: buildReference(payment),
      isDownPayment: payment.isDownPayment === true,
      branchName: payment.sale.branch?.name || '',
      branchId: payment.sale.branch?.id || '',
    };
  }
}

function classifyMethod(payment: SalePayment): TodayPaymentMethodCode | 'credit' {
  const code = (payment.paymentMethod?.code || '').toLowerCase().trim();
  const name = (payment.paymentMethod?.name || '').toLowerCase().trim();
  const hay = `${code} ${name}`;

  if (includesAny(hay, ['cash', 'efectivo'])) return 'cash';
  if (includesAny(hay, ['bank_transfer', 'transfer', 'transferencia', 'deposit', 'depósito', 'deposito', 'wire'])) {
    return 'transfer';
  }
  if (includesAny(hay, ['credit_card', 'debit_card', 'tarjeta', 'card'])) return 'card';
  if (includesAny(hay, ['cxc', 'fiado', 'credito', 'crédito']) || code === 'credit' || name === 'crédito' || name === 'credito') {
    return 'credit';
  }
  return 'other';
}

function includesAny(hay: string, tokens: string[]): boolean {
  return tokens.some((t) => hay.includes(t));
}

function paidAtSource(payment: SalePayment): Date {
  const date = new Date(payment.date);
  if (!Number.isNaN(date.getTime()) && hasClock(date)) return date;
  return new Date(payment.createdAt);
}

function hasClock(date: Date): boolean {
  return date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0;
}

function formatTimeGt(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

function buildReference(payment: SalePayment): string | null {
  const ref = payment.referenceNumber?.trim() || '';
  const bank = payment.bankAccount?.bankName?.trim() || payment.manualBankAccount?.trim() || '';
  if (bank && ref) return `${bank} ${ref}`;
  if (ref) return ref;
  if (bank) return bank;
  return null;
}

function civilToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function dayBounds(ymd: string) {
  return {
    start: new Date(`${ymd}T00:00:00-06:00`),
    end: new Date(`${ymd}T23:59:59.999-06:00`),
  };
}

function round2(n: number): number {
  return Number(Number(n).toFixed(2));
}
