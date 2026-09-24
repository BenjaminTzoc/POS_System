import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale, SaleDetail, SaleStatus } from '../../sales/entities';
import { Branch } from '../../logistics/entities';
import {
  CustomerWeeklyDayDto,
  CustomerWeeklyItemDto,
  CustomerWeeklyMixItemDto,
  CustomerWeeklySummaryDto,
  WeekDayLabel,
} from '../dto/customer-weekly-summary.dto';

const GUEST_KEY = '__guest__';
const GUEST_NAME = 'Consumidor final';
const TZ = 'America/Guatemala';
const DAY_LABELS: WeekDayLabel[] = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const COUNTS_AS_SALE = `NOT (sale.isPreorder = true AND sale.status = :pendingStatus)`;

@Injectable()
export class CustomerWeeklySummaryService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async getWeeklySummary(weekStartDate: string, branchId?: string, limit = 50): Promise<CustomerWeeklySummaryDto> {
    const { start, end, prevStart, prevEnd, periodStart, periodEnd } = this.resolveWeek(weekStartDate);
    await this.assertBranch(branchId);

    const params = { cancelled: SaleStatus.CANCELLED, pendingStatus: SaleStatus.PENDING };

    const [aggregates, prevTotals, daysRows, mixRows] = await Promise.all([
      this.queryWeekAggregates(start, end, branchId, params),
      this.queryWeekTotals(prevStart, prevEnd, branchId, params),
      this.queryDays(start, end, branchId, params),
      this.queryMix(start, end, branchId, params),
    ]);

    const customerIds = aggregates.filter((row) => !row.isGuest && row.id).map((row) => row.id as string);
    const includeGuest = aggregates.some((row) => row.isGuest);

    const [lastPurchases, creditUsedMap] = await Promise.all([
      this.queryLastPurchases(customerIds, includeGuest),
      this.queryCreditUsed(customerIds),
    ]);

    const mixByCustomer = this.groupMix(mixRows);
    const daysByCustomer = this.groupDays(daysRows, periodStart);

    const items: CustomerWeeklyItemDto[] = aggregates.map((row) => {
      const total = round2(row.total);
      const orderCount = Number(row.orderCount) || 0;
      const prevTotal = round2(prevTotals.get(row.key) ?? 0);
      const mix = this.buildMix(mixByCustomer.get(row.key) ?? [], total);

      return {
        id: row.isGuest ? null : row.id,
        name: row.isGuest ? GUEST_NAME : row.name,
        isGuest: row.isGuest,
        category: row.isGuest
          ? { id: null, name: GUEST_NAME }
          : { id: row.categoryId, name: row.categoryName || 'Sin categoría' },
        total,
        orderCount,
        averageTicket: orderCount > 0 ? round2(total / orderCount) : 0,
        trendPercent: this.trendPercent(total, prevTotal),
        paidAmount: round2(row.paidAmount),
        pendingAmount: round2(row.pendingAmount),
        creditLimit: row.isGuest ? 0 : round2(row.creditLimit),
        creditUsed: row.isGuest ? 0 : round2(creditUsedMap.get(row.key) ?? 0),
        lastPurchaseDate: lastPurchases.get(row.key) ?? null,
        inactiveThisWeek: false,
        preorderCommitted: round2(row.preorderCommitted),
        topProduct: this.toTopProduct(mix),
        mix,
        days: daysByCustomer.get(row.key) ?? this.emptyDays(periodStart),
      };
    });

    items.sort((a, b) => b.total - a.total);

    const kpis = this.buildKpis(items, aggregates);

    return {
      period: { start: periodStart, end: periodEnd },
      kpis,
      customers: items.slice(0, limit),
    };
  }

  private resolveWeek(weekStartDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
      throw new BadRequestException('weekStartDate debe ser YYYY-MM-DD');
    }

    const [year, month, day] = weekStartDate.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
      throw new BadRequestException('weekStartDate inválido');
    }

    const isoDow = utc.getUTCDay() === 0 ? 7 : utc.getUTCDay();
    const monday = new Date(utc);
    monday.setUTCDate(utc.getUTCDate() - (isoDow - 1));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const prevMonday = new Date(monday);
    prevMonday.setUTCDate(monday.getUTCDate() - 7);
    const prevSunday = new Date(monday);
    prevSunday.setUTCDate(monday.getUTCDate() - 1);

    const periodStart = toYmd(monday);
    const periodEnd = toYmd(sunday);

    return {
      periodStart,
      periodEnd,
      start: new Date(`${periodStart}T00:00:00-06:00`),
      end: new Date(`${periodEnd}T23:59:59.999-06:00`),
      prevStart: new Date(`${toYmd(prevMonday)}T00:00:00-06:00`),
      prevEnd: new Date(`${toYmd(prevSunday)}T23:59:59.999-06:00`),
    };
  }

  private async assertBranch(branchId?: string) {
    if (!branchId) return;
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) {
      throw new BadRequestException('branchId inexistente');
    }
  }

  private applySaleFilters(qb: any, start: Date, end: Date, branchId: string | undefined) {
    qb.where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled')
      .andWhere('sale.date BETWEEN :start AND :end', { start, end });
    if (branchId) qb.andWhere('sale.branch_id = :branchId', { branchId });
    return qb;
  }

  private async queryWeekAggregates(start: Date, end: Date, branchId: string | undefined, params: { cancelled: SaleStatus; pendingStatus: SaleStatus }) {
    const qb = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoin('sale.customer', 'customer')
      .leftJoin('customer.category', 'category')
      .select(`COALESCE(customer.id::text, '${GUEST_KEY}')`, 'key')
      .addSelect('customer.id', 'id')
      .addSelect(`COALESCE(customer.name, '${GUEST_NAME}')`, 'name')
      .addSelect(`CASE WHEN customer.id IS NULL THEN true ELSE false END`, 'isGuest')
      .addSelect('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COALESCE(customer.creditLimit, 0)', 'creditLimit')
      .addSelect(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN sale.total ELSE 0 END), 0)`, 'total')
      .addSelect(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN 1 ELSE 0 END), 0)`, 'orderCount')
      .addSelect(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN sale.paidAmount ELSE 0 END), 0)`, 'paidAmount')
      .addSelect(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN sale.pendingAmount ELSE 0 END), 0)`, 'pendingAmount')
      .addSelect(`COALESCE(SUM(CASE WHEN sale.isPreorder = true AND sale.status = :pendingStatus THEN sale.total ELSE 0 END), 0)`, 'preorderCommitted')
      .addSelect(`COALESCE(SUM(sale.pendingAmount), 0)`, 'allPendingAmount');

    this.applySaleFilters(qb, start, end, branchId);
    qb.setParameters(params)
      .groupBy('customer.id')
      .addGroupBy('customer.name')
      .addGroupBy('category.id')
      .addGroupBy('category.name')
      .addGroupBy('customer.creditLimit');

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      key: r.key as string,
      id: r.id ? String(r.id) : null,
      name: r.name as string,
      isGuest: r.isGuest === true || r.isGuest === 'true' || r.isGuest === 't',
      categoryId: r.categoryId ? String(r.categoryId) : null,
      categoryName: r.categoryName as string | null,
      creditLimit: Number(r.creditLimit) || 0,
      total: Number(r.total) || 0,
      orderCount: Number(r.orderCount) || 0,
      paidAmount: Number(r.paidAmount) || 0,
      pendingAmount: Number(r.pendingAmount) || 0,
      preorderCommitted: Number(r.preorderCommitted) || 0,
      allPendingAmount: Number(r.allPendingAmount) || 0,
    }));
  }

  private async queryWeekTotals(start: Date, end: Date, branchId: string | undefined, params: { cancelled: SaleStatus; pendingStatus: SaleStatus }) {
    const qb = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoin('sale.customer', 'customer')
      .select(`COALESCE(customer.id::text, '${GUEST_KEY}')`, 'key')
      .addSelect(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN sale.total ELSE 0 END), 0)`, 'total');

    this.applySaleFilters(qb, start, end, branchId);
    qb.setParameters(params).groupBy('customer.id');

    const rows = await qb.getRawMany();
    return new Map(rows.map((r) => [r.key as string, Number(r.total) || 0]));
  }

  private async queryDays(start: Date, end: Date, branchId: string | undefined, params: { cancelled: SaleStatus; pendingStatus: SaleStatus }) {
    const qb = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoin('sale.customer', 'customer')
      .select(`COALESCE(customer.id::text, '${GUEST_KEY}')`, 'key')
      .addSelect('EXTRACT(ISODOW FROM sale.date)', 'dayNumber')
      .addSelect(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN sale.total ELSE 0 END), 0)`, 'total')
      .addSelect(`COALESCE(SUM(CASE WHEN ${COUNTS_AS_SALE} THEN 1 ELSE 0 END), 0)`, 'orderCount');

    this.applySaleFilters(qb, start, end, branchId);
    qb.setParameters(params).groupBy('customer.id').addGroupBy('EXTRACT(ISODOW FROM sale.date)');

    return qb.getRawMany();
  }

  private async queryMix(start: Date, end: Date, branchId: string | undefined, params: { cancelled: SaleStatus; pendingStatus: SaleStatus }) {
    const qb = this.saleDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.sale', 'sale')
      .innerJoin('detail.product', 'product')
      .leftJoin('product.unit', 'unit')
      .leftJoin('sale.customer', 'customer')
      .select(`COALESCE(customer.id::text, '${GUEST_KEY}')`, 'key')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect(`COALESCE(unit.abbreviation, '')`, 'unit')
      .addSelect('SUM(detail.quantity)', 'quantity')
      .addSelect('SUM(detail.lineTotal)', 'revenue')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled')
      .andWhere(COUNTS_AS_SALE)
      .andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (branchId) qb.andWhere('sale.branch_id = :branchId', { branchId });

    return qb
      .setParameters(params)
      .groupBy('customer.id')
      .addGroupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('unit.abbreviation')
      .getRawMany();
  }

  private async queryLastPurchases(customerIds: string[], includeGuest: boolean) {
    const map = new Map<string, string>();
    if (customerIds.length === 0 && !includeGuest) return map;

    const qb = this.saleRepository
      .createQueryBuilder('sale')
      .select(`COALESCE(sale.customer_id::text, '${GUEST_KEY}')`, 'key')
      .addSelect('MAX(sale.date)', 'lastDate')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED });

    if (customerIds.length && includeGuest) {
      qb.andWhere('(sale.customer_id IN (:...customerIds) OR sale.customer_id IS NULL)', { customerIds });
    } else if (customerIds.length) {
      qb.andWhere('sale.customer_id IN (:...customerIds)', { customerIds });
    } else {
      qb.andWhere('sale.customer_id IS NULL');
    }

    const rows = await qb.groupBy('sale.customer_id').getRawMany();
    for (const r of rows) {
      map.set(r.key, new Date(r.lastDate).toLocaleDateString('en-CA', { timeZone: TZ }));
    }
    return map;
  }

  private async queryCreditUsed(customerIds: string[]) {
    const map = new Map<string, number>();
    if (customerIds.length === 0) return map;

    const rows = await this.saleRepository
      .createQueryBuilder('sale')
      .select('sale.customer_id', 'key')
      .addSelect('COALESCE(SUM(sale.pendingAmount), 0)', 'creditUsed')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('sale.customer_id IN (:...customerIds)', { customerIds })
      .groupBy('sale.customer_id')
      .getRawMany();

    for (const r of rows) {
      map.set(String(r.key), Number(r.creditUsed) || 0);
    }
    return map;
  }

  private groupMix(rows: any[]) {
    const map = new Map<string, { productId: string | null; productName: string; quantity: number; unit: string; revenue: number }[]>();
    for (const r of rows) {
      const key = r.key as string;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({
        productId: r.productId ? String(r.productId) : null,
        productName: r.productName,
        quantity: round3(Number(r.quantity) || 0),
        unit: r.unit || '',
        revenue: round2(Number(r.revenue) || 0),
      });
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.revenue - a.revenue);
    }
    return map;
  }

  private buildMix(products: { productId: string | null; productName: string; quantity: number; unit: string; revenue: number }[], total: number): CustomerWeeklyMixItemDto[] {
    if (total <= 0 || products.length === 0) return [];

    const top = products.slice(0, 5);
    const restRevenue = round2(products.slice(5).reduce((sum, p) => sum + p.revenue, 0));
    const restQty = round3(products.slice(5).reduce((sum, p) => sum + p.quantity, 0));

    const items: CustomerWeeklyMixItemDto[] = top.map((p) => ({
      ...p,
      share: Math.round((p.revenue / total) * 100),
    }));

    if (restRevenue > 0) {
      items.push({
        productId: null,
        productName: 'Otros',
        quantity: restQty,
        unit: '',
        revenue: restRevenue,
        share: Math.round((restRevenue / total) * 100),
      });
    }

    return items;
  }

  private groupDays(rows: any[], periodStart: string) {
    const map = new Map<string, CustomerWeeklyDayDto[]>();
    for (const r of rows) {
      const key = r.key as string;
      if (!map.has(key)) map.set(key, this.emptyDays(periodStart));
      const dayIdx = parseInt(r.dayNumber, 10) - 1;
      if (dayIdx < 0 || dayIdx > 6) continue;
      const days = map.get(key)!;
      days[dayIdx].total = round2(Number(r.total) || 0);
      days[dayIdx].orderCount = Number(r.orderCount) || 0;
    }
    return map;
  }

  private emptyDays(periodStart: string): CustomerWeeklyDayDto[] {
    const [y, m, d] = periodStart.split('-').map(Number);
    const monday = new Date(Date.UTC(y, m - 1, d));
    return DAY_LABELS.map((day, i) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + i);
      return { date: toYmd(date), day, total: 0, orderCount: 0 };
    });
  }

  private toTopProduct(mix: CustomerWeeklyMixItemDto[]): CustomerWeeklyItemDto['topProduct'] {
    const top = mix.find((item) => item.productName !== 'Otros') ?? mix[0];
    if (!top) return null;
    return {
      productId: top.productId,
      name: top.productName,
      quantity: top.quantity,
      unit: top.unit,
    };
  }

  private trendPercent(current: number, previous: number): number {
    if (previous === 0 && current > 0) return 100;
    if (previous === 0 && current === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private buildKpis(items: CustomerWeeklyItemDto[], aggregates: { allPendingAmount: number }[]) {
    const active = items.filter((c) => c.total > 0);
    const universeTotal = active.reduce((sum, c) => sum + c.total, 0);
    const universeOrders = active.reduce((sum, c) => sum + c.orderCount, 0);
    const top5Total = active.slice(0, 5).reduce((sum, c) => sum + c.total, 0);

    return {
      topCustomer: active.length ? { id: active[0].id, name: active[0].name, total: active[0].total } : null,
      averageTicket: universeOrders > 0 ? round2(universeTotal / universeOrders) : 0,
      top5Concentration: universeTotal > 0 ? Math.round((top5Total / universeTotal) * 100) : 0,
      pendingAmount: round2(aggregates.reduce((sum, row) => sum + row.allPendingAmount, 0)),
      activeCustomerCount: active.length,
    };
  }
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Number(Number(n).toFixed(2));
}

function round3(n: number): number {
  return Number(Number(n).toFixed(3));
}
