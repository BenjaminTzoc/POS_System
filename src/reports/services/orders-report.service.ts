import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Sale, SaleStatus } from '../../sales/entities';
import { Product, Inventory } from '../../logistics/entities';
import { Repository } from 'typeorm';

@Injectable()
export class OrdersReportService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
  ) {}

  async getOrdersSummary(branchId?: string): Promise<{
    total: { total: number; percentageChange: number; trend: string };
    pending: { total: number; percentageChange: number; trend: string };
    completed: { total: number; percentageChange: number; trend: string };
    products: { total: number; newToday: number };
    lowStockAlerts: any[];
    hourlySales: { date: string; currency: string; data: any[] };
    recentTransactions: any[];
    paymentStatus: {
      paid: { amount: number; count: number };
      pending: { amount: number; count: number };
      overdue: { amount: number; count: number };
    };
  }> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(now);
    startOfYesterday.setDate(now.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(now);
    endOfYesterday.setDate(now.getDate() - 1);
    endOfYesterday.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    // --- 1. TOTAL DE ÓRDENES ---
    const totalTodayQuery = this.saleRepository.createQueryBuilder('sale').where('sale.date BETWEEN :start AND :end', { start: startOfToday, end: now });

    const totalYesterdayQuery = this.saleRepository.createQueryBuilder('sale').where('sale.date BETWEEN :start AND :end', { start: startOfYesterday, end: endOfYesterday });

    // --- 2. ÓRDENES PENDIENTES ---
    const pendingNowQuery = this.saleRepository.createQueryBuilder('sale').where('sale.status = :status', { status: SaleStatus.PENDING });

    const pendingStillFromYesterdayQuery = this.saleRepository.createQueryBuilder('sale').where('sale.status = :status', { status: SaleStatus.PENDING }).andWhere('sale.date < :today', { today: startOfToday });

    const pendingResolvedTodayQuery = this.saleRepository.createQueryBuilder('sale').where('sale.status != :status', { status: SaleStatus.PENDING }).andWhere('sale.updatedAt >= :today', { today: startOfToday }).andWhere('sale.date < :today', { today: startOfToday });

    // --- 3. ÓRDENES COMPLETADAS ---
    const completedTodayQuery = this.saleRepository.createQueryBuilder('sale').where('sale.status = :status', { status: SaleStatus.DELIVERED }).andWhere('sale.updatedAt BETWEEN :start AND :end', { start: startOfToday, end: now });

    const completedYesterdayQuery = this.saleRepository.createQueryBuilder('sale').where('sale.status = :status', { status: SaleStatus.DELIVERED }).andWhere('sale.updatedAt BETWEEN :start AND :end', { start: startOfYesterday, end: endOfYesterday });

    // --- 4. ESTADÍSTICAS DE PRODUCTOS ---
    const productsTotalQuery = this.productRepository.createQueryBuilder('product').where('product.isActive = true');

    const productsNewTodayQuery = this.productRepository.createQueryBuilder('product').where('product.isActive = true').andWhere('product.createdAt >= :today', { today: startOfToday });

    // --- 5. ALERTAS DE STOCK BAJO ---
    const lowStockQuery = this.inventoryRepository.createQueryBuilder('inventory').innerJoinAndSelect('inventory.product', 'product').innerJoinAndSelect('inventory.branch', 'branch').leftJoinAndSelect('product.unit', 'unit').where('product.isActive = true').andWhere('inventory.stock <= inventory.min_stock').andWhere('inventory.min_stock > 0');

    // --- 6. VENTAS POR HORA (HOY) ---
    const hourlyQuery = this.saleRepository.createQueryBuilder('sale').select('EXTRACT(HOUR FROM sale.date)', 'hour').addSelect('SUM(sale.total)', 'total').where('sale.date BETWEEN :start AND :end', { start: startOfToday, end: now }).andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED });

    // --- 7. ÚLTIMAS TRANSACCIONES ---
    const recentTransactionsQuery = this.saleRepository.createQueryBuilder('sale').leftJoinAndSelect('sale.customer', 'customer').leftJoinAndSelect('sale.branch', 'branch').where('sale.date BETWEEN :start AND :end', { start: startOfToday, end: now }).orderBy('sale.date', 'DESC').take(15); // Traemos las últimas 15 del día

    // --- 8. MÉTRICAS DE PAGO (PARA CHART) - FILTRADO POR MES ACTUAL ---
    const basePaymentQuery = this.saleRepository.createQueryBuilder('sale').where('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED }).andWhere('sale.date >= :startOfMonth', { startOfMonth });

    const paidQuery = basePaymentQuery.clone().select('SUM(sale.total)', 'amount').addSelect('COUNT(sale.id)', 'count').andWhere('sale.pending_amount = 0');

    const pendingPaymentQuery = basePaymentQuery.clone().select('SUM(sale.pending_amount)', 'amount').addSelect('COUNT(sale.id)', 'count').andWhere('sale.pending_amount > 0').andWhere('(sale.due_date IS NULL OR sale.due_date >= :now)', { now });

    const overdueQuery = basePaymentQuery.clone().select('SUM(sale.pending_amount)', 'amount').addSelect('COUNT(sale.id)', 'count').andWhere('sale.pending_amount > 0').andWhere('sale.due_date < :now', { now });

    if (branchId) {
      [totalTodayQuery, totalYesterdayQuery, pendingNowQuery, pendingStillFromYesterdayQuery, pendingResolvedTodayQuery, completedTodayQuery, completedYesterdayQuery, hourlyQuery, recentTransactionsQuery, paidQuery, pendingPaymentQuery, overdueQuery].forEach((q) => {
        q.andWhere('sale.branch_id = :branchId', { branchId });
      });

      lowStockQuery.andWhere('inventory.branch_id = :branchId', { branchId });
    }

    const [totalToday, totalYesterday, pendingNow, pendingStill, pendingResolved, completedToday, completedYesterday, productsTotal, productsNewToday, lowStockInventories, hourlyDataRaw, recentSales, paidDataRaw, pendingPaymentDataRaw, overdueDataRaw] = await Promise.all([totalTodayQuery.getCount(), totalYesterdayQuery.getCount(), pendingNowQuery.getCount(), pendingStillFromYesterdayQuery.getCount(), pendingResolvedTodayQuery.getCount(), completedTodayQuery.getCount(), completedYesterdayQuery.getCount(), productsTotalQuery.getCount(), productsNewTodayQuery.getCount(), lowStockQuery.getMany(), hourlyQuery.groupBy('hour').orderBy('hour', 'ASC').getRawMany(), recentTransactionsQuery.getMany(), paidQuery.getRawOne(), pendingPaymentQuery.getRawOne(), overdueQuery.getRawOne()]);

    const currentHour = now.getHours();
    const hourlySalesMap = new Map<number, number>();
    hourlyDataRaw.forEach((d: any) => {
      hourlySalesMap.set(parseInt(d.hour, 10), Number(d.total));
    });

    const hourlySalesData: { hour: string; total: number }[] = [];
    const startHour = Math.max(0, currentHour - 5);
    for (let h = startHour; h <= currentHour; h++) {
      const formattedHour = `${h.toString().padStart(2, '0')}:00`;
      hourlySalesData.push({
        hour: formattedHour,
        total: Number((hourlySalesMap.get(h) || 0).toFixed(2)),
      });
    }

    const calculateMetrics = (current: number, previous: number) => {
      let percentageChange = 0;
      if (previous === 0) {
        percentageChange = current > 0 ? 1.0 : 0.0;
      } else {
        percentageChange = (current - previous) / previous;
      }
      let trend: 'up' | 'down' | 'equal' = 'equal';
      if (current > previous) trend = 'up';
      else if (current < previous) trend = 'down';

      return { total: current, percentageChange: Number(percentageChange.toFixed(2)), trend };
    };

    const lowStockAlerts = lowStockInventories.map((inv) => ({
      productId: inv.product.id,
      branchId: inv.branch.id,
      branchName: inv.branch.name,
      code: inv.product.sku,
      name: inv.product.name,
      currentStock: Number(inv.stock),
      minStock: Number(inv.minStock),
      unit: inv.product.unit?.abbreviation,
      message: `El producto "${inv.product.name}" en la sucursal "${inv.branch.name}" se está agotando. Considere reabastecer la sucursal.`,
    }));

    const recentTransactions = recentSales.map((sale) => {
      const saleDate = new Date(sale.date);
      let status: 'success' | 'pending' | 'failed' = 'pending';

      if (sale.status === SaleStatus.DELIVERED || sale.status === SaleStatus.CONFIRMED) {
        status = 'success';
      } else if (sale.status === SaleStatus.CANCELLED) {
        status = 'failed';
      }

      return {
        id: sale.invoiceNumber,
        time: `${saleDate.getHours().toString().padStart(2, '0')}:${saleDate.getMinutes().toString().padStart(2, '0')}`,
        amount: Number(sale.total),
        status,
        saleStatus: sale.status,
        customer: sale.customer?.name || sale.guestCustomer?.name || 'Venta Mostrador',
        branch: sale.branch?.name,
      };
    });

    return {
      total: calculateMetrics(totalToday, totalYesterday),
      pending: calculateMetrics(pendingNow, pendingStill + pendingResolved),
      completed: calculateMetrics(completedToday, completedYesterday),
      products: {
        total: productsTotal,
        newToday: productsNewToday,
      },
      lowStockAlerts,
      hourlySales: {
        date: now.toISOString().split('T')[0],
        currency: 'USD',
        data: hourlySalesData,
      },
      recentTransactions,
      paymentStatus: {
        paid: {
          amount: Number(Number(paidDataRaw?.amount || 0).toFixed(2)),
          count: Number(paidDataRaw?.count || 0),
        },
        pending: {
          amount: Number(Number(pendingPaymentDataRaw?.amount || 0).toFixed(2)),
          count: Number(pendingPaymentDataRaw?.count || 0),
        },
        overdue: {
          amount: Number(Number(overdueDataRaw?.amount || 0).toFixed(2)),
          count: Number(overdueDataRaw?.count || 0),
        },
      },
    };
  }
}
