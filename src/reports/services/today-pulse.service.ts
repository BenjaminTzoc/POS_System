import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale, SalePayment, SaleStatus, PaymentStatus } from '../../sales/entities';
import { Branch, Inventory } from '../../logistics/entities';
import { TodayPulseDto } from '../dto/today-pulse.dto';

const TZ = 'America/Guatemala';
const GUEST_NAME = 'Consumidor final';
const COUNTS_AS_SALE = `NOT (sale.isPreorder = true AND sale.status = :pendingStatus)`;

const QUEUE_PREORDER = `sale.isPreorder = true AND sale.status = :pendingStatus`;
const QUEUE_PREPARING = `sale.status IN (:...preparingStatuses) AND NOT (${QUEUE_PREORDER})`;
const QUEUE_DELIVERY = `sale.status IN (:...deliveryStatuses)`;

const PREPARING_STATUSES = [SaleStatus.PENDING, SaleStatus.PREPARING, SaleStatus.ON_HOLD];
const DELIVERY_STATUSES = [
  SaleStatus.CONFIRMED,
  SaleStatus.READY_FOR_PICKUP,
  SaleStatus.OUT_FOR_DELIVERY,
  SaleStatus.PARTIALLY_DELIVERED,
];

const CASH_CODES = ['cash', 'efectivo'];
const CREDIT_CODES = ['credit', 'credito', 'crédito', 'cxc', 'account', 'fiado'];

@Injectable()
export class TodayPulseService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SalePayment)
    private readonly paymentRepository: Repository<SalePayment>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async getTodayPulse(branchId?: string, lowStockLimit = 3): Promise<TodayPulseDto> {
    await this.assertBranch(branchId);

    const today = civilToday();
    const yesterday = addCivilDays(today, -1);
    const todayBounds = dayBounds(today);
    const yesterdayBounds = dayBounds(yesterday);
    const now = new Date();

    const params = { cancelled: SaleStatus.CANCELLED, pendingStatus: SaleStatus.PENDING };

    const [todaySales, yesterdaySales, payments, pending, receivable, attention] = await Promise.all([
      this.queryDaySales(todayBounds.start, todayBounds.end, branchId, params),
      this.queryDaySales(yesterdayBounds.start, yesterdayBounds.end, branchId, params),
      this.queryPaymentsToday(todayBounds.start, todayBounds.end, branchId),
      this.queryPendingQueue(branchId, params, now),
      this.queryReceivable(branchId, today),
      this.queryAttention(branchId, todayBounds.start, todayBounds.end, lowStockLimit, params),
    ]);

    const ticketCount = todaySales.ticketCount;
    const total = round2(todaySales.total);
    const previousTotal = round2(yesterdaySales.total);

    return {
      date: today,
      currency: 'GTQ',
      sales: {
        total,
        previousTotal,
        changePercent: this.changePercent(total, previousTotal),
        ticketCount,
        averageTicket: ticketCount > 0 ? round2(total / ticketCount) : 0,
        cashToday: round2(payments.cashToday),
        creditToday: round2(todaySales.creditToday),
        otherToday: round2(payments.otherToday),
        peakHour: this.peakHourLabel(todaySales.peakHour),
      },
      pending,
      receivable,
      attention,
    };
  }

  private async assertBranch(branchId?: string) {
    if (!branchId) return;
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) throw new BadRequestException('branchId inexistente');
  }

  private applyBranch(qb: any, alias: string, branchId?: string) {
    if (branchId) qb.andWhere(`${alias}.branch_id = :branchId`, { branchId });
  }

  private async queryDaySales(start: Date, end: Date, branchId: string | undefined, params: { cancelled: SaleStatus; pendingStatus: SaleStatus }) {
    const totalsQb = this.saleRepository
      .createQueryBuilder('sale')
      .select(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN sale.total ELSE 0 END), 0)`, 'total')
      .addSelect(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN 1 ELSE 0 END), 0)`, 'ticketCount')
      .addSelect(
        `COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN GREATEST(sale.total - COALESCE(sale.paidAmount, 0), 0) ELSE 0 END), 0)`,
        'creditToday',
      )
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled')
      .andWhere('sale.date BETWEEN :start AND :end', { start, end });

    this.applyBranch(totalsQb, 'sale', branchId);
    totalsQb.setParameters(params);

    const peakQb = this.saleRepository
      .createQueryBuilder('sale')
      .select('EXTRACT(HOUR FROM sale.date)', 'hour')
      .addSelect(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN sale.total ELSE 0 END), 0)`, 'total')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled')
      .andWhere('sale.date BETWEEN :start AND :end', { start, end })
      .andWhere(COUNTS_AS_SALE);

    this.applyBranch(peakQb, 'sale', branchId);
    peakQb.setParameters(params).groupBy('EXTRACT(HOUR FROM sale.date)').orderBy('total', 'DESC').addOrderBy('hour', 'ASC').limit(1);

    const [totals, peak] = await Promise.all([totalsQb.getRawOne(), peakQb.getRawOne()]);

    return {
      total: Number(totals?.total) || 0,
      ticketCount: Number(totals?.ticketCount) || 0,
      creditToday: Number(totals?.creditToday) || 0,
      peakHour: peak && Number(peak.total) > 0 ? Number(peak.hour) : null,
    };
  }

  private async queryPaymentsToday(start: Date, end: Date, branchId?: string) {
    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .innerJoin('payment.sale', 'sale')
      .innerJoin('payment.paymentMethod', 'method')
      .select(
        `COALESCE(SUM(CASE WHEN LOWER(method.code) IN (:...cashCodes) OR LOWER(method.name) IN (:...cashCodes) THEN payment.amount ELSE 0 END), 0)`,
        'cashToday',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN LOWER(method.code) NOT IN (:...cashCodes) AND LOWER(method.name) NOT IN (:...cashCodes) AND LOWER(method.code) NOT IN (:...creditCodes) AND LOWER(method.name) NOT IN (:...creditCodes) THEN payment.amount ELSE 0 END), 0)`,
        'otherToday',
      )
      .where('payment.deletedAt IS NULL')
      .andWhere('payment.status = :completed', { completed: PaymentStatus.COMPLETED })
      .andWhere('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('payment.date BETWEEN :start AND :end', { start, end })
      .setParameters({ cashCodes: CASH_CODES, creditCodes: CREDIT_CODES });

    this.applyBranch(qb, 'sale', branchId);

    const row = await qb.getRawOne();
    return {
      cashToday: Number(row?.cashToday) || 0,
      otherToday: Number(row?.otherToday) || 0,
    };
  }

  private async queryPendingQueue(branchId: string | undefined, params: { cancelled: SaleStatus; pendingStatus: SaleStatus }, now: Date) {
    const countsQb = this.saleRepository
      .createQueryBuilder('sale')
      .select(`COALESCE(SUM(CASE WHEN ${QUEUE_PREORDER} THEN 1 ELSE 0 END), 0)`, 'preorder')
      .addSelect(`COALESCE(SUM(CASE WHEN ${QUEUE_PREPARING} THEN 1 ELSE 0 END), 0)`, 'preparing')
      .addSelect(`COALESCE(SUM(CASE WHEN ${QUEUE_DELIVERY} THEN 1 ELSE 0 END), 0)`, 'delivery')
      .where('sale.deletedAt IS NULL')
      .andWhere(`(${QUEUE_PREORDER} OR ${QUEUE_PREPARING} OR ${QUEUE_DELIVERY})`);

    this.applyBranch(countsQb, 'sale', branchId);
    countsQb.setParameters({
      ...params,
      preparingStatuses: PREPARING_STATUSES,
      deliveryStatuses: DELIVERY_STATUSES,
    });

    const oldestQb = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoin('sale.customer', 'customer')
      .select('sale.id', 'saleId')
      .addSelect(`COALESCE(customer.name, :guestName)`, 'name')
      .addSelect('sale.date', 'date')
      .where('sale.deletedAt IS NULL')
      .andWhere(`(${QUEUE_PREORDER} OR ${QUEUE_PREPARING} OR ${QUEUE_DELIVERY})`);

    this.applyBranch(oldestQb, 'sale', branchId);
    oldestQb
      .setParameters({
        ...params,
        preparingStatuses: PREPARING_STATUSES,
        deliveryStatuses: DELIVERY_STATUSES,
        guestName: GUEST_NAME,
      })
      .orderBy('sale.date', 'ASC')
      .addOrderBy('sale.id', 'ASC')
      .limit(1);

    const [counts, oldest] = await Promise.all([countsQb.getRawOne(), oldestQb.getRawOne()]);

    const preparing = Number(counts?.preparing) || 0;
    const delivery = Number(counts?.delivery) || 0;
    const preorder = Number(counts?.preorder) || 0;
    const total = preparing + delivery + preorder;

    if (total === 0) {
      return { total: 0, preparing: 0, delivery: 0, preorder: 0, oldestMinutes: null, nextCustomer: null };
    }

    const oldestDate = oldest?.date ? new Date(oldest.date) : now;
    const oldestMinutes = Math.max(0, Math.floor((now.getTime() - oldestDate.getTime()) / 60000));

    return {
      total,
      preparing,
      delivery,
      preorder,
      oldestMinutes,
      nextCustomer: oldest?.saleId ? { saleId: String(oldest.saleId), name: oldest.name || GUEST_NAME } : null,
    };
  }

  private async queryReceivable(branchId: string | undefined, today: string) {
    const qb = this.saleRepository
      .createQueryBuilder('sale')
      .select('COALESCE(SUM(sale.pendingAmount), 0)', 'total')
      .addSelect('COUNT(sale.id)', 'invoiceCount')
      .addSelect(
        `COALESCE(SUM(CASE WHEN sale.dueDate IS NOT NULL AND DATE(sale.dueDate) < :today::date THEN sale.pendingAmount ELSE 0 END), 0)`,
        'overdue',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN sale.dueDate IS NOT NULL AND DATE(sale.dueDate) = :today::date THEN sale.pendingAmount ELSE 0 END), 0)`,
        'dueToday',
      )
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('sale.pendingAmount > 0')
      .setParameter('today', today);

    this.applyBranch(qb, 'sale', branchId);

    const debtorQb = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoin('sale.customer', 'customer')
      .select('customer.id', 'customerId')
      .addSelect(`COALESCE(customer.name, :guestName)`, 'name')
      .addSelect('COALESCE(SUM(sale.pendingAmount), 0)', 'amount')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('sale.pendingAmount > 0')
      .setParameter('guestName', GUEST_NAME)
      .groupBy('customer.id')
      .addGroupBy('customer.name')
      .orderBy('amount', 'DESC')
      .limit(1);

    this.applyBranch(debtorQb, 'sale', branchId);

    const [row, debtor] = await Promise.all([qb.getRawOne(), debtorQb.getRawOne()]);
    const total = round2(Number(row?.total) || 0);

    return {
      total,
      overdue: round2(Number(row?.overdue) || 0),
      dueToday: round2(Number(row?.dueToday) || 0),
      invoiceCount: Number(row?.invoiceCount) || 0,
      topDebtor:
        total > 0 && debtor
          ? {
              customerId: debtor.customerId ? String(debtor.customerId) : null,
              name: debtor.name || GUEST_NAME,
              amount: round2(Number(debtor.amount) || 0),
            }
          : null,
    };
  }

  private async queryAttention(
    branchId: string | undefined,
    todayStart: Date,
    todayEnd: Date,
    lowStockLimit: number,
    params: { cancelled: SaleStatus; pendingStatus: SaleStatus },
  ) {
    const stockQb = this.inventoryRepository
      .createQueryBuilder('inventory')
      .innerJoin('inventory.product', 'product')
      .innerJoin('inventory.branch', 'branch')
      .leftJoin('product.unit', 'unit')
      .select('product.id', 'productId')
      .addSelect('product.name', 'name')
      .addSelect('inventory.stock', 'quantity')
      .addSelect(`COALESCE(unit.abbreviation, '')`, 'unit')
      .addSelect('branch.name', 'branchName')
      .addSelect('inventory.minStock', 'minStock')
      .where('inventory.deletedAt IS NULL')
      .andWhere('product.manageStock = true')
      .andWhere('inventory.stock <= inventory.minStock');

    this.applyBranch(stockQb, 'inventory', branchId);

    const countRow = await stockQb.clone().select('COUNT(*)', 'count').getRawOne();
    const rows = await stockQb
      .orderBy(
        `CASE WHEN inventory.minStock = 0 THEN 0 ELSE inventory.stock / NULLIF(inventory.minStock, 0) END`,
        'ASC',
      )
      .addOrderBy('inventory.stock', 'ASC')
      .limit(lowStockLimit)
      .getRawMany();

    const preorderQb = this.saleRepository
      .createQueryBuilder('sale')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled')
      .andWhere('sale.isPreorder = true')
      .andWhere('sale.promisedDeliveryDate BETWEEN :start AND :end', { start: todayStart, end: todayEnd });

    this.applyBranch(preorderQb, 'sale', branchId);
    preorderQb.setParameters(params);

    const preordersForToday = await preorderQb.getCount();

    return {
      lowStockCount: Number(countRow?.count) || 0,
      preordersForToday,
      lowStock: rows.map((r) => ({
        productId: String(r.productId),
        name: r.name,
        quantity: round3(Number(r.quantity) || 0),
        unit: r.unit || '',
        branchName: r.branchName || undefined,
      })),
    };
  }

  private changePercent(total: number, previousTotal: number): number {
    if (previousTotal === 0 && total === 0) return 0;
    if (previousTotal === 0 && total > 0) return 100;
    return Number((((total - previousTotal) / previousTotal) * 100).toFixed(1));
  }

  private peakHourLabel(hour: number | null) {
    if (hour === null || Number.isNaN(hour)) return { hour: null, label: null };
    const h = Math.trunc(hour);
    const hh = String(h).padStart(2, '0');
    const next = String(h + 1).padStart(2, '0');
    return { hour: h, label: `${hh}:00–${next}:00` };
  }
}

function civilToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function addCivilDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
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

function round3(n: number): number {
  return Number(Number(n).toFixed(3));
}
