import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale, SaleDetail, SaleStatus } from '../../sales/entities';
import { Branch } from '../../logistics/entities';

@Injectable()
export class ConsolidatedReportsService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async getDashboardCalendar(month: number, year: number, branchId?: string): Promise<any> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const now = new Date();

    const pendingPaymentsQuery = this.saleRepository.createQueryBuilder('sale').leftJoinAndSelect('sale.customer', 'customer').where('sale.deletedAt IS NULL').andWhere('sale.pending_amount > 0').andWhere('sale.due_date BETWEEN :start AND :end', {
      start: startOfMonth,
      end: endOfMonth,
    });

    if (branchId) {
      pendingPaymentsQuery.andWhere('sale.branch_id = :branchId', { branchId });
    }

    const sales = await pendingPaymentsQuery.orderBy('sale.due_date', 'ASC').addOrderBy('sale.pending_amount', 'DESC').getMany();

    const calendarData = {};

    sales.forEach((sale) => {
      if (!sale.dueDate) return;
      const dateKey = sale.dueDate.toISOString().split('T')[0];

      if (!calendarData[dateKey]) {
        calendarData[dateKey] = [
          {
            type: 'pending_payment',
            label: 'Cobros Pendientes',
            count: 0,
            total: 0,
            color: 'orange',
            dotColor: '#f97316',
            orders: [],
          },
        ];
      }

      const event = calendarData[dateKey][0];
      event.count++;
      event.total = Number((Number(event.total) + Number(sale.pendingAmount)).toFixed(2));

      event.orders.push({
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        customerName: sale.customer?.name || sale.guestCustomer?.name || 'Consumidor Final',
        pendingAmount: Number(sale.pendingAmount),
        total: Number(sale.total),
        saleDate: sale.date,
        dueDate: sale.dueDate,
        isOverdue: sale.dueDate < now,
      });
    });
    return calendarData;
  }

  async getWeeklyBranchConsolidated(month?: number, year?: number, branchId?: string): Promise<any[]> {
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();

    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);

    const startOfComparison = new Date(startOfMonth);
    startOfComparison.setDate(startOfComparison.getDate() - 7);

    const weeksInMonth: { weekChart: string; startDate: string; endDate: string; dateRange: string }[] = [];
    let current = new Date(startOfMonth);
    const day = current.getDay();
    const diff = current.getDate() - (day === 0 ? 6 : day - 1);
    current.setDate(diff);

    const weeksToFetch: string[] = [];
    const tempCurrent = new Date(current);
    tempCurrent.setDate(tempCurrent.getDate() - 7);

    for (let i = 0; i < 7; i++) {
      const weekStart = tempCurrent.toISOString().split('T')[0];
      weeksToFetch.push(weekStart);

      const sunday = new Date(tempCurrent);
      sunday.setDate(tempCurrent.getDate() + 6);
      const weekEnd = sunday.toISOString().split('T')[0];

      if (tempCurrent >= startOfMonth || sunday >= startOfMonth) {
        const yearPrefix = tempCurrent.getFullYear();
        const oneJan = new Date(yearPrefix, 0, 1);
        const numberOfDays = Math.floor((tempCurrent.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((tempCurrent.getDay() + 1 + numberOfDays) / 7);

        weeksInMonth.push({
          weekChart: `${yearPrefix}-W${weekNumber.toString().padStart(2, '0')}`,
          startDate: weekStart,
          endDate: weekEnd,
          dateRange: `${weekStart} al ${weekEnd}`,
        });
      }
      tempCurrent.setDate(tempCurrent.getDate() + 7);
      if (tempCurrent > endOfMonth) break;
    }

    const query = this.saleRepository.createQueryBuilder('sale').innerJoin('sale.branch', 'branch').select('branch.id', 'branchId').addSelect("TO_CHAR(DATE_TRUNC('week', sale.date), 'YYYY-MM-DD')", 'weekDate').addSelect('SUM(sale.total)', 'total').addSelect('COUNT(sale.id)', 'count').addSelect('AVG(sale.total)', 'average').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED }).andWhere('sale.date BETWEEN :start AND :end', { start: startOfComparison, end: endOfMonth }).groupBy('branch.id').addGroupBy("DATE_TRUNC('week', sale.date)");

    if (branchId) query.andWhere('branch.id = :branchId', { branchId });
    const results = await query.getRawMany();

    let branches: Branch[] = [];
    if (branchId) branches = await this.branchRepository.find({ where: { id: branchId } });
    else branches = await this.branchRepository.find();

    return branches.map((b) => {
      const branchWeeks = weeksInMonth.map((w, index) => {
        const stats = results.find((r) => r.branchId === b.id && r.weekDate === w.startDate);
        const currentTotal = Number(stats?.total || 0);

        const prevWeekStart = new Date(w.startDate);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevWeekKey = prevWeekStart.toISOString().split('T')[0];
        const prevStats = results.find((r) => r.branchId === b.id && r.weekDate === prevWeekKey);
        const prevTotal = Number(prevStats?.total || 0);

        let trend: 'up' | 'down' | 'equal' = 'equal';
        if (currentTotal > prevTotal) trend = 'up';
        else if (currentTotal < prevTotal) trend = 'down';

        return {
          week: w.weekChart,
          startDate: w.startDate,
          endDate: w.endDate,
          dateRange: w.dateRange,
          total: Number(currentTotal.toFixed(2)),
          count: Number(stats?.count || 0),
          averageTicket: Number(Number(stats?.average || 0).toFixed(2)),
          trend,
        };
      });

      return {
        branchId: b.id,
        branchName: b.name,
        weeks: branchWeeks,
        totalRevenue: Number(branchWeeks.reduce((sum, w) => sum + w.total, 0).toFixed(2)),
      };
    });
  }

  async getWeeklyProductConsolidated(weekStartDate: string, branchId?: string): Promise<any> {
    const start = new Date(weekStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const query = this.saleDetailRepository.createQueryBuilder('detail').innerJoin('detail.sale', 'sale').innerJoin('detail.product', 'product').select('product.id', 'id').addSelect('product.name', 'name').addSelect('product.sku', 'sku').addSelect('EXTRACT(ISODOW FROM sale.date)', 'dayNumber').addSelect('SUM(detail.lineTotal)', 'total').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED }).andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (branchId) query.andWhere('sale.branch_id = :branchId', { branchId });

    const results = await query.groupBy('product.id, product.name, product.sku').addGroupBy('EXTRACT(ISODOW FROM sale.date)').getRawMany();

    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const productsMap = new Map();

    results.forEach((r) => {
      if (!productsMap.has(r.id)) {
        productsMap.set(r.id, {
          sku: r.sku,
          name: r.name,
          days: dayNames.map((d) => ({ day: d, total: 0 })),
          total: 0,
        });
      }
      const p = productsMap.get(r.id);
      const dayIdx = parseInt(r.dayNumber) - 1;
      p.days[dayIdx].total = Number(Number(r.total).toFixed(2));
      p.total = Number((p.total + Number(r.total)).toFixed(2));
    });

    return {
      period: { start, end },
      data: Array.from(productsMap.values()).sort((a, b) => b.total - a.total),
    };
  }

  async getWeeklyCustomerConsolidated(weekStartDate: string, branchId?: string): Promise<any> {
    const start = new Date(weekStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const query = this.saleRepository.createQueryBuilder('sale').leftJoin('sale.customer', 'customer').select("COALESCE(customer.id::text, 'guest')", 'id').addSelect('COALESCE("customer"."name", ("sale"."guestCustomer"->>\'name\'))', 'name').addSelect('EXTRACT(ISODOW FROM sale.date)', 'dayNumber').addSelect('SUM(sale.total)', 'total').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED }).andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (branchId) query.andWhere('sale.branch_id = :branchId', { branchId });

    const results = await query.groupBy("COALESCE(customer.id::text, 'guest')").addGroupBy('COALESCE("customer"."name", ("sale"."guestCustomer"->>\'name\'))').addGroupBy('EXTRACT(ISODOW FROM sale.date)').getRawMany();

    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const customersMap = new Map();

    results.forEach((r) => {
      const key = `${r.id}-${r.name}`;
      if (!customersMap.has(key)) {
        customersMap.set(key, {
          id: r.id,
          name: r.name || 'Consumidor Final',
          days: dayNames.map((d) => ({ day: d, total: 0 })),
          total: 0,
        });
      }
      const c = customersMap.get(key);
      const dayIdx = parseInt(r.dayNumber) - 1;
      c.days[dayIdx].total = Number(Number(r.total).toFixed(2));
      c.total = Number((c.total + Number(r.total)).toFixed(2));
    });

    return {
      period: { start, end },
      data: Array.from(customersMap.values()).sort((a, b) => b.total - a.total),
    };
  }
}
