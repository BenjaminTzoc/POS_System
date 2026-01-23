import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Sale, SaleDetail, SaleStatus } from '../../sales/entities';
import { Inventory } from '../../logistics/entities';
import { IsNull, Repository } from 'typeorm';
import { InventoryService } from '../../logistics/services/inventory.service';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly inventoryService: InventoryService,
  ) {}

  async getDashboardSummary(branchId?: string): Promise<DashboardSummaryDto> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Total ventas hoy
    const salesQuery = this.saleRepository
      .createQueryBuilder('sale')
      .select('SUM(sale.total)', 'total')
      .where('sale.date BETWEEN :start AND :end', {
        start: todayStart,
        end: todayEnd,
      })
      .andWhere('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      });

    if (branchId) {
      salesQuery.andWhere('sale.branch_id = :branchId', { branchId });
    }

    const salesResult = await salesQuery.getRawOne();
    const totalSalesToday = Number(salesResult.total || 0);

    // 2. Órdenes pendientes
    const pendingQuery = this.saleRepository
      .createQueryBuilder('sale')
      .where('sale.status = :status', { status: SaleStatus.PENDING })
      .andWhere('sale.deletedAt IS NULL');

    if (branchId) {
      pendingQuery.andWhere('sale.branch_id = :branchId', { branchId });
    }

    const pendingOrdersCount = await pendingQuery.getCount();

    // 3. Valor de inventario y productos bajo stock
    const inventoryStats =
      await this.inventoryService.getInventoryStats(branchId);

    return {
      totalSalesToday: Number(totalSalesToday.toFixed(2)),
      pendingOrdersCount,
      inventoryValue: inventoryStats.totalValue,
      lowStockProductsCount: inventoryStats.lowStockProducts,
    };
  }

  async getSalesTrends(
    days: number = 7,
    branchId?: string,
    startDateParam?: Date,
    endDateParam?: Date,
  ): Promise<any[]> {
    const query = this.saleRepository
      .createQueryBuilder('sale')
      .select("TO_CHAR(sale.date, 'YYYY-MM-DD')", 'date')
      .addSelect('SUM(sale.total)', 'total')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      });

    if (startDateParam && endDateParam) {
      query.andWhere('sale.date BETWEEN :start AND :end', {
        start: startDateParam,
        end: endDateParam,
      });
    } else {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days + 1);
      startDate.setHours(0, 0, 0, 0);
      query.andWhere('sale.date >= :startDate', { startDate });
    }

    if (branchId) {
      query.andWhere('sale.branch_id = :branchId', { branchId });
    }

    const results = await query
      .groupBy("TO_CHAR(sale.date, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    return results.map((r) => ({
      date: r.date,
      total: Number(Number(r.total).toFixed(2)),
    }));
  }

  async getTopSellingProducts(
    limit: number = 5,
    branchId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any[]> {
    const query = this.saleDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.sale', 'sale')
      .innerJoin('detail.product', 'product')
      .select('product.name', 'productName')
      .addSelect('SUM(detail.quantity)', 'quantity')
      .addSelect('SUM(detail.lineTotal)', 'revenue')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      });

    if (startDate && endDate) {
      query.andWhere('sale.date BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    if (branchId) {
      query.andWhere('sale.branch_id = :branchId', { branchId });
    }

    const results = await query
      .groupBy('product.name')
      .orderBy('revenue', 'DESC')
      .limit(limit)
      .getRawMany();

    return results.map((r) => ({
      productName: r.productName,
      quantity: Number(r.quantity),
      revenue: Number(Number(r.revenue).toFixed(2)),
    }));
  }

  async getCategoryDistribution(branchId?: string): Promise<any[]> {
    // Calculamos la distribución basada en la cantidad de productos en inventario por categoría
    const query = this.inventoryRepository
      .createQueryBuilder('inventory')
      .innerJoin('inventory.product', 'product')
      .innerJoin('product.category', 'category')
      .select('category.name', 'categoryName')
      .addSelect('COUNT(DISTINCT product.id)', 'productCount')
      .where('inventory.deletedAt IS NULL');

    if (branchId) {
      query.andWhere('inventory.branch_id = :branchId', { branchId });
    }

    const results = await query.groupBy('category.name').getRawMany();

    const totalProducts = results.reduce(
      (sum, r) => sum + Number(r.productCount),
      0,
    );

    return results.map((r) => ({
      category: r.categoryName,
      productCount: Number(r.productCount),
      percentage:
        totalProducts > 0
          ? Number(((Number(r.productCount) / totalProducts) * 100).toFixed(2))
          : 0,
    }));
  }

  async getSalesByPaymentMethod(
    branchId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any[]> {
    const query = this.saleRepository
      .createQueryBuilder('sale')
      .innerJoin('sale.payments', 'payment')
      .innerJoin('payment.paymentMethod', 'method')
      .select('method.name', 'methodName')
      .addSelect('SUM(payment.amount)', 'total')
      .addSelect('COUNT(DISTINCT sale.id)', 'count')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      });

    if (startDate && endDate) {
      query.andWhere('sale.date BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    if (branchId) {
      query.andWhere('sale.branch_id = :branchId', { branchId });
    }

    const results = await query.groupBy('method.name').getRawMany();

    return results.map((r) => ({
      method: r.methodName,
      total: Number(Number(r.total).toFixed(2)),
      count: Number(r.count),
    }));
  }
}
