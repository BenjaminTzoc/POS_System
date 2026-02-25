import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale, SaleDetail, SaleStatus } from '../../sales/entities';
import { Product, Branch } from '../../logistics/entities';

@Injectable()
export class SalesReportsService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  calculateDates(startParam?: Date, endParam?: Date, frequency: string = 'week', days: number = 7): { start: Date; end: Date } {
    let start: Date;
    let end: Date = endParam || new Date();

    if (startParam && endParam) {
      start = startParam;
      end = endParam;
    } else {
      const now = new Date();
      switch (frequency) {
        case 'day':
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          end = new Date(now);
          end.setHours(23, 59, 59, 999);
          break;
        case 'week':
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          start = new Date(now);
          start.setDate(diff);
          start.setHours(0, 0, 0, 0);
          end = new Date();
          end.setHours(23, 59, 59, 999);
          break;
        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          start.setHours(0, 0, 0, 0);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          end.setHours(23, 59, 59, 999);
          break;
        case 'year':
          start = new Date(now.getFullYear(), 0, 1);
          start.setHours(0, 0, 0, 0);
          end = new Date(now.getFullYear(), 11, 31);
          end.setHours(23, 59, 59, 999);
          break;
        default:
          start = new Date();
          start.setDate(start.getDate() - (days - 1));
          start.setHours(0, 0, 0, 0);
      }
    }
    return { start, end };
  }

  async getSalesTrends(branchId?: string, days: number = 7, startDateParam?: Date, endDateParam?: Date, frequency: 'day' | 'week' | 'month' | 'year' = 'day'): Promise<any[]> {
    const query = this.saleRepository.createQueryBuilder('sale');

    let dateSelect: string;
    let groupBy: string;
    let actualFrequency = frequency;

    if (startDateParam && endDateParam) {
      const diffTime = Math.abs(endDateParam.getTime() - startDateParam.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 2) actualFrequency = 'day';
      else if (diffDays <= 60) actualFrequency = 'week';
      else if (diffDays <= 365) actualFrequency = 'month';
      else actualFrequency = 'year';
    }

    switch (actualFrequency) {
      case 'day':
        dateSelect = "TO_CHAR(DATE_TRUNC('hour', sale.date), 'YYYY-MM-DD HH24:00')";
        groupBy = "DATE_TRUNC('hour', sale.date)";
        break;
      case 'week':
        dateSelect = "TO_CHAR(sale.date, 'YYYY-MM-DD')";
        groupBy = "TO_CHAR(sale.date, 'YYYY-MM-DD')";
        break;
      case 'month':
        dateSelect = "TO_CHAR(DATE_TRUNC('week', sale.date), 'YYYY-MM-DD')";
        groupBy = "DATE_TRUNC('week', sale.date)";
        break;
      case 'year':
        dateSelect = "TO_CHAR(DATE_TRUNC('month', sale.date), 'YYYY-MM')";
        groupBy = "DATE_TRUNC('month', sale.date)";
        break;
      default:
        dateSelect = "TO_CHAR(sale.date, 'YYYY-MM-DD')";
        groupBy = "TO_CHAR(sale.date, 'YYYY-MM-DD')";
        break;
    }

    query.select(dateSelect, 'date').addSelect('SUM(sale.total)', 'total').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED });

    if (startDateParam && endDateParam) {
      query.andWhere('sale.date BETWEEN :start AND :end', { start: startDateParam, end: endDateParam });
    } else {
      query.andWhere("sale.date >= DATE_TRUNC('day', NOW() - INTERVAL '" + (days - 1) + " days')");
    }

    if (branchId) {
      query.andWhere('sale.branch_id = :branchId', { branchId });
    }

    const results = await query.groupBy(groupBy).orderBy(groupBy, 'ASC').getRawMany();

    const finalResults: any[] = [];
    const resultsMap = new Map(results.map((r) => [r.date, Number(r.total)]));

    let start: Date;
    let end: Date;

    if (startDateParam && endDateParam) {
      start = new Date(startDateParam);
      end = new Date(endDateParam);
    } else {
      start = new Date();
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
      end = new Date();
    }

    const current = new Date(start);
    while (current <= end) {
      const y = current.getFullYear();
      const m = (current.getMonth() + 1).toString().padStart(2, '0');
      const d = current.getDate().toString().padStart(2, '0');
      let key = `${y}-${m}-${d}`;

      if (actualFrequency === 'day') {
        const h = current.getHours().toString().padStart(2, '0');
        key = `${y}-${m}-${d} ${h}:00`;
      } else if (actualFrequency === 'year') {
        key = `${y}-${m}`;
      } else if (actualFrequency === 'month') {
        const currDay = current.getDay();
        const startOfWeek = new Date(current);
        startOfWeek.setDate(current.getDate() - currDay + (currDay === 0 ? -6 : 1));
        const wy = startOfWeek.getFullYear();
        const wm = (startOfWeek.getMonth() + 1).toString().padStart(2, '0');
        const wd = startOfWeek.getDate().toString().padStart(2, '0');
        key = `${wy}-${wm}-${wd}`;
      }

      if (!finalResults.find((r) => r.date === key)) {
        finalResults.push({ date: key, total: resultsMap.get(key) || 0 });
      }

      if (actualFrequency === 'day') current.setHours(current.getHours() + 1);
      else if (actualFrequency === 'month') current.setDate(current.getDate() + 7);
      else if (actualFrequency === 'year') current.setMonth(current.getMonth() + 1);
      else current.setDate(current.getDate() + 1);

      if (finalResults.length > 500) break;
    }

    return finalResults;
  }

  async getCategorySales(branchId?: string, startDateParam?: Date, endDateParam?: Date, frequency: 'day' | 'week' | 'month' | 'year' | 'custom' = 'week'): Promise<any> {
    const { start, end } = this.calculateDates(startDateParam, endDateParam, frequency);

    const totalRevenueQuery = this.saleRepository.createQueryBuilder('sale').select('SUM(sale.total)', 'total').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED }).andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (branchId) totalRevenueQuery.andWhere('sale.branch_id = :branchId', { branchId });
    const { total } = await totalRevenueQuery.getRawOne();
    const totalRevenuePeriod = Number(total || 0);

    const query = this.saleDetailRepository.createQueryBuilder('detail').innerJoin('detail.sale', 'sale').innerJoin('detail.product', 'product').innerJoin('product.category', 'category').select('category.name', 'categoryName').addSelect('SUM(detail.quantity)', 'quantity').addSelect('SUM(detail.lineTotal)', 'revenue').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED }).andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (branchId) query.andWhere('sale.branch_id = :branchId', { branchId });

    const results = await query.groupBy('category.name').orderBy('revenue', 'DESC').getRawMany();

    return {
      period: { start, end },
      totalRevenue: totalRevenuePeriod,
      categories: results.map((r) => ({
        category: r.categoryName,
        quantity: Number(r.quantity),
        revenue: Number(Number(r.revenue).toFixed(2)),
        percentage: totalRevenuePeriod > 0 ? Number(((Number(r.revenue) / totalRevenuePeriod) * 100).toFixed(2)) : 0,
      })),
    };
  }

  async getProductPerformance(limit: number = 10, branchId?: string, startDateParam?: Date, endDateParam?: Date, frequency: 'day' | 'week' | 'month' | 'year' | 'custom' = 'week'): Promise<any> {
    const { start, end } = this.calculateDates(startDateParam, endDateParam, frequency);

    const totalRevenueQuery = this.saleRepository.createQueryBuilder('sale').select('SUM(sale.total)', 'total').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED }).andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (branchId) totalRevenueQuery.andWhere('sale.branch_id = :branchId', { branchId });
    const { total } = await totalRevenueQuery.getRawOne();
    const totalRevenuePeriod = Number(total || 0);

    const baseQuery = this.saleDetailRepository.createQueryBuilder('detail').innerJoin('detail.sale', 'sale').innerJoin('detail.product', 'product').leftJoin('product.unit', 'unit').select('product.id', 'productId').addSelect('product.name', 'productName').addSelect('unit.name', 'unitName').addSelect('SUM(detail.quantity)', 'quantity').addSelect('SUM(detail.lineTotal)', 'revenue').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED }).andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (branchId) baseQuery.andWhere('sale.branch_id = :branchId', { branchId });

    const topSelling = await baseQuery.clone().groupBy('product.id, product.name, unit.name').orderBy('revenue', 'DESC').limit(limit).getRawMany();
    const leastSelling = await baseQuery.clone().groupBy('product.id, product.name, unit.name').orderBy('revenue', 'ASC').limit(limit).getRawMany();

    const mapResult = (r: any) => ({
      productId: r.productId,
      productName: r.productName,
      unit: r.unitName,
      quantity: Number(r.quantity),
      revenue: Number(Number(r.revenue).toFixed(2)),
      percentage: totalRevenuePeriod > 0 ? Number(((Number(r.revenue) / totalRevenuePeriod) * 100).toFixed(2)) : 0,
    });

    const soldProductIdsQuery = this.saleDetailRepository.createQueryBuilder('detail').innerJoin('detail.sale', 'sale').select('DISTINCT detail.product_id', 'id').where('sale.date BETWEEN :start AND :end', { start, end }).andWhere('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED });

    if (branchId) soldProductIdsQuery.andWhere('sale.branch_id = :branchId', { branchId });

    const stagnantProducts = await this.productRepository.createQueryBuilder('product').leftJoinAndSelect('product.unit', 'unit').where('product.isActive = true').andWhere(`product.id NOT IN (${soldProductIdsQuery.getQuery()})`).setParameters(soldProductIdsQuery.getParameters()).limit(limit).getMany();

    return {
      period: { start, end },
      totalRevenue: totalRevenuePeriod,
      topSelling: topSelling.map(mapResult),
      leastSelling: leastSelling.map(mapResult),
      stagnantProducts: stagnantProducts.map((p) => ({
        productId: p.id,
        productName: p.name,
        unit: p.unit?.name,
        quantity: 0,
        revenue: 0,
        percentage: 0,
      })),
    };
  }

  async getBranchPerformance(branchId?: string, startDateParam?: Date, endDateParam?: Date, frequency: 'day' | 'week' | 'month' | 'year' | 'custom' = 'week', sortBy: 'revenue' | 'count' | 'average' = 'revenue', order: 'ASC' | 'DESC' = 'DESC'): Promise<any> {
    const { start, end } = this.calculateDates(startDateParam, endDateParam, frequency);

    const salesQuery = this.saleRepository.createQueryBuilder('sale').innerJoin('sale.branch', 'branch').select('branch.id', 'branchId').addSelect('branch.name', 'branchName').addSelect('COUNT(sale.id)', 'count').addSelect('SUM(sale.total)', 'revenue').addSelect('AVG(sale.total)', 'average').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED }).andWhere('sale.date BETWEEN :start AND :end', { start, end }).groupBy('branch.id, branch.name');

    if (branchId) salesQuery.andWhere('branch.id = :branchId', { branchId });

    const sortFieldMap = { revenue: 'revenue', count: 'count', average: 'average' };
    const results = await salesQuery.orderBy(sortFieldMap[sortBy] || 'revenue', order).getRawMany();

    let allBranches: Branch[];
    if (branchId) allBranches = await this.branchRepository.find({ where: { id: branchId } });
    else allBranches = await this.branchRepository.find();

    const finalData = allBranches.map((branch) => {
      const saleData = results.find((r) => r.branchId === branch.id);
      return {
        branchId: branch.id,
        branchName: branch.name,
        revenue: Number(Number(saleData?.revenue || 0).toFixed(2)),
        count: Number(saleData?.count || 0),
        averageTicket: Number(Number(saleData?.average || 0).toFixed(2)),
      };
    });

    finalData.sort((a, b) => {
      const field = sortBy === 'average' ? 'averageTicket' : sortBy;
      return order === 'DESC' ? b[field] - a[field] : a[field] - b[field];
    });

    return { period: { start, end }, branches: finalData };
  }

  async getHourlySalesDistribution(branchId?: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    const query = this.saleRepository.createQueryBuilder('sale').select("DATE_PART('hour', sale.date)", 'hour').addSelect('COUNT(sale.id)', 'count').addSelect('SUM(sale.total)', 'total').where('sale.deletedAt IS NULL').andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED });

    if (branchId) query.andWhere('sale.branch_id = :branchId', { branchId });
    if (startDate && endDate) query.andWhere('sale.date BETWEEN :start AND :end', { start: startDate, end: endDate });

    const results = await query.groupBy('hour').orderBy('hour', 'ASC').getRawMany();

    const distribution = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: 0,
      total: 0,
    }));

    results.forEach((r) => {
      const hour = parseInt(r.hour);
      distribution[hour].count = parseInt(r.count);
      distribution[hour].total = Number(Number(r.total).toFixed(2));
    });

    return distribution;
  }

  async getMonthlyProductSalesTrends(month?: number, year?: number, branchId?: string, limit: number = 5, page: number = 1): Promise<any> {
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();

    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
    const offset = (page - 1) * limit;

    const productsQuery = this.saleDetailRepository
      .createQueryBuilder('detail')
      .leftJoin('detail.sale', 'sale')
      .leftJoin('detail.product', 'product')
      .select(['product.id AS id', 'product.name AS name', 'SUM(detail.lineTotal) AS total'])
      .where('sale.date BETWEEN :start AND :end', { start: startOfMonth, end: endOfMonth })
      .andWhere('sale.status NOT IN (:...invalidStatuses)', {
        invalidStatuses: [SaleStatus.CANCELLED, SaleStatus.PENDING],
      })
      .andWhere(branchId ? 'sale.branch_id = :branchId' : '1=1', { branchId })
      .groupBy('product.id')
      .addGroupBy('product.name')
      .orderBy('total', 'DESC');

    const totalProductsResult = await this.saleDetailRepository
      .createQueryBuilder('detail')
      .leftJoin('detail.sale', 'sale')
      .select('COUNT(DISTINCT detail.product_id)', 'count')
      .where('sale.date BETWEEN :start AND :end', { start: startOfMonth, end: endOfMonth })
      .andWhere('sale.status NOT IN (:...invalidStatuses)', {
        invalidStatuses: [SaleStatus.CANCELLED, SaleStatus.PENDING],
      })
      .andWhere(branchId ? 'sale.branch_id = :branchId' : '1=1', { branchId })
      .getRawOne();

    const totalProducts = parseInt(totalProductsResult?.count || '0');

    const topProducts = await productsQuery.limit(limit).offset(offset).getRawMany();

    if (topProducts.length === 0) {
      return {
        month: m,
        year: y,
        categories: [],
        series: [],
        pagination: { total: totalProducts, page, limit },
      };
    }

    const productIds = topProducts.map((p) => p.id);
    const productNames = topProducts.map((p) => p.name);

    const dailySales = await this.saleDetailRepository
      .createQueryBuilder('detail')
      .leftJoin('detail.sale', 'sale')
      .select(['detail.product_id AS productId', "DATE_PART('day', sale.date) AS day", 'SUM(detail.lineTotal) AS total'])
      .where('sale.date BETWEEN :start AND :end', { start: startOfMonth, end: endOfMonth })
      .andWhere('detail.product_id IN (:...productIds)', { productIds })
      .andWhere('sale.status NOT IN (:...invalidStatuses)', {
        invalidStatuses: [SaleStatus.CANCELLED, SaleStatus.PENDING],
      })
      .andWhere(branchId ? 'sale.branch_id = :branchId' : '1=1', { branchId })
      .groupBy('detail.product_id')
      .addGroupBy("DATE_PART('day', sale.date)")
      .getRawMany();

    const daysInMonth = endOfMonth.getDate();
    const categories = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);

    const series = productIds.map((id, index) => {
      const productName = productNames[index];
      const data = categories.map((dayStr) => {
        const day = parseInt(dayStr);
        const match = dailySales.find((ds) => ds.productid === id && parseInt(ds.day) === day);
        return match ? parseFloat(match.total) : 0;
      });

      return {
        name: productName,
        data: data,
      };
    });

    return {
      month: m,
      year: y,
      categories,
      series,
      pagination: {
        total: totalProducts,
        page,
        limit,
        totalPages: Math.ceil(totalProducts / limit),
      },
    };
  }
}
