import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale, SaleDetail, SaleStatus } from '../../sales/entities';
import { Branch, Category } from '../../logistics/entities';
import {
  TopProductDailySaleDto,
  TopProductItemDto,
  TopProductsKpisDto,
  TopProductsSummaryDto,
  TopProductsSummaryQueryDto,
} from '../dto/top-products-summary.dto';

const round2 = (num: number): number => Math.round((num + Number.EPSILON) * 100) / 100;

const COUNTS_AS_SALE = `NOT (sale.isPreorder = true AND sale.status = :pendingStatus)`;

@Injectable()
export class TopProductsSummaryService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async getTopProductsSummary(query: TopProductsSummaryQueryDto): Promise<TopProductsSummaryDto> {
    const { start, end, startDateStr, endDateStr } = this.resolveDateRange(query.startDate, query.endDate);
    if (query.branchId) {
      await this.assertBranch(query.branchId);
    }

    const limit = query.limit || 10;
    const sortBy = query.sortBy === 'quantity' ? 'quantity' : 'revenue';
    const params = {
      cancelled: SaleStatus.CANCELLED,
      pendingStatus: SaleStatus.PENDING,
      start,
      end,
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    // 1. Period total revenue and total volume
    const totalsQb = this.saleDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.sale', 'sale')
      .select('COALESCE(SUM(detail.lineTotal), 0)', 'totalRevenue')
      .addSelect('COALESCE(SUM(detail.quantity), 0)', 'totalUnits')
      .addSelect('COUNT(DISTINCT detail.product_id)', 'totalProductsCount')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled')
      .andWhere(COUNTS_AS_SALE)
      .andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (query.branchId) {
      totalsQb.andWhere('sale.branch_id = :branchId', { branchId: query.branchId });
    }

    const totalsRaw = await totalsQb.setParameters(params).getRawOne();
    const totalRevenue = round2(Number(totalsRaw?.totalRevenue) || 0);
    const totalUnitsSold = round2(Number(totalsRaw?.totalUnits) || 0);
    const totalProductsCount = Number(totalsRaw?.totalProductsCount) || 0;

    // 2. Query products performance ranked
    const productsQb = this.saleDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.sale', 'sale')
      .innerJoin('detail.product', 'product')
      .leftJoin('product.category', 'category')
      .leftJoin('product.unit', 'unit')
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.sku', 'sku')
      .addSelect(`COALESCE(category.name, 'Sin categoría')`, 'categoryName')
      .addSelect(`COALESCE(unit.abbreviation, '')`, 'unit')
      .addSelect('COALESCE(SUM(detail.quantity), 0)', 'quantity')
      .addSelect('COALESCE(SUM(detail.lineTotal), 0)', 'revenue')
      .addSelect('COUNT(DISTINCT sale.id)', 'orderCount')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled')
      .andWhere(COUNTS_AS_SALE)
      .andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (query.branchId) {
      productsQb.andWhere('sale.branch_id = :branchId', { branchId: query.branchId });
    }

    productsQb
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('product.sku')
      .addGroupBy('category.name')
      .addGroupBy('unit.abbreviation')
      .setParameters(params);

    if (sortBy === 'quantity') {
      productsQb.orderBy('quantity', 'DESC').addOrderBy('revenue', 'DESC');
    } else {
      productsQb.orderBy('revenue', 'DESC').addOrderBy('quantity', 'DESC');
    }

    const productsRaw = await productsQb.limit(limit).getRawMany();

    // 3. Category Leader
    const catQb = this.saleDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.sale', 'sale')
      .innerJoin('detail.product', 'product')
      .leftJoin('product.category', 'category')
      .select(`COALESCE(category.name, 'Sin categoría')`, 'categoryName')
      .addSelect('COALESCE(SUM(detail.lineTotal), 0)', 'revenue')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled')
      .andWhere(COUNTS_AS_SALE)
      .andWhere('sale.date BETWEEN :start AND :end', { start, end });

    if (query.branchId) {
      catQb.andWhere('sale.branch_id = :branchId', { branchId: query.branchId });
    }

    const leaderCatRaw = await catQb
      .setParameters(params)
      .groupBy('category.name')
      .orderBy('revenue', 'DESC')
      .limit(1)
      .getRawOne();

    const leaderCategory = leaderCatRaw
      ? {
          categoryName: leaderCatRaw.categoryName,
          revenue: round2(Number(leaderCatRaw.revenue) || 0),
          percentage: totalRevenue > 0 ? round2(((Number(leaderCatRaw.revenue) || 0) / totalRevenue) * 100) : 0,
        }
      : null;

    // 4. Daily timeline/sparkline for the top products
    const productIds = productsRaw.map((p) => p.productId);
    let dailyMap = new Map<string, Map<string, { total: number; quantity: number }>>();

    if (productIds.length > 0) {
      const dailyQb = this.saleDetailRepository
        .createQueryBuilder('detail')
        .innerJoin('detail.sale', 'sale')
        .select('detail.product_id', 'productId')
        .addSelect("TO_CHAR(sale.date AT TIME ZONE 'America/Guatemala', 'YYYY-MM-DD')", 'dayStr')
        .addSelect('COALESCE(SUM(detail.lineTotal), 0)', 'total')
        .addSelect('COALESCE(SUM(detail.quantity), 0)', 'quantity')
        .where('sale.deletedAt IS NULL')
        .andWhere('sale.status != :cancelled')
        .andWhere(COUNTS_AS_SALE)
        .andWhere('detail.product_id IN (:...productIds)', { productIds })
        .andWhere('sale.date BETWEEN :start AND :end', { start, end });

      if (query.branchId) {
        dailyQb.andWhere('sale.branch_id = :branchId', { branchId: query.branchId });
      }

      const dailyRows = await dailyQb
        .setParameters(params)
        .groupBy('detail.product_id')
        .addGroupBy("TO_CHAR(sale.date AT TIME ZONE 'America/Guatemala', 'YYYY-MM-DD')")
        .getRawMany();

      dailyRows.forEach((r) => {
        if (!dailyMap.has(r.productId)) {
          dailyMap.set(r.productId, new Map());
        }
        dailyMap.get(r.productId)!.set(r.dayStr, {
          total: round2(Number(r.total) || 0),
          quantity: round2(Number(r.quantity) || 0),
        });
      });
    }

    // Days timeline generator for sparkline
    const daysInterval = this.generateDaysList(startDateStr, endDateStr);

    const products: TopProductItemDto[] = productsRaw.map((p) => {
      const q = round2(Number(p.quantity) || 0);
      const rev = round2(Number(p.revenue) || 0);
      const orders = Number(p.orderCount) || 0;
      const avgPrice = q > 0 ? round2(rev / q) : 0;
      const percentage = totalRevenue > 0 ? round2((rev / totalRevenue) * 100) : 0;

      const pDaily = dailyMap.get(p.productId) || new Map();
      const sparkline: TopProductDailySaleDto[] = daysInterval.map((day) => {
        const item = pDaily.get(day.date) || { total: 0, quantity: 0 };
        return {
          date: day.date,
          dayLabel: day.label,
          total: item.total,
          quantity: item.quantity,
        };
      });

      return {
        productId: p.productId,
        productName: p.productName,
        sku: p.sku || undefined,
        categoryName: p.categoryName,
        unit: p.unit || 'unidad',
        quantity: q,
        revenue: rev,
        orderCount: orders,
        averagePrice: avgPrice,
        percentage,
        sparkline,
      };
    });

    const leaderProduct = products.length > 0 ? {
      productId: products[0].productId,
      productName: products[0].productName,
      revenue: products[0].revenue,
      quantity: products[0].quantity,
      unit: products[0].unit,
    } : null;

    const kpis: TopProductsKpisDto = {
      totalRevenue,
      totalUnitsSold,
      totalProductsCount,
      leaderProduct,
      leaderCategory,
    };

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
      },
      kpis,
      products,
    };
  }

  private resolveDateRange(startStr?: string, endStr?: string) {
    const now = new Date();
    // Default to current month: from day 1 to last day of month
    let sStr = startStr;
    let eStr = endStr;

    if (!sStr || !eStr) {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(Date.UTC(y, m, 1));
      const last = new Date(Date.UTC(y, m + 1, 0));
      sStr = first.toISOString().split('T')[0];
      eStr = last.toISOString().split('T')[0];
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(sStr) || !/^\d{4}-\d{2}-\d{2}$/.test(eStr)) {
      throw new BadRequestException('Formato de fecha inválido. Utilice YYYY-MM-DD');
    }

    const start = new Date(`${sStr}T00:00:00-06:00`);
    const end = new Date(`${eStr}T23:59:59.999-06:00`);

    if (start > end) {
      throw new BadRequestException('startDate no puede ser posterior a endDate');
    }

    return {
      start,
      end,
      startDateStr: sStr,
      endDateStr: eStr,
    };
  }

  private generateDaysList(startStr: string, endStr: string) {
    const days: { date: string; label: string }[] = [];
    const cur = new Date(`${startStr}T12:00:00Z`);
    const last = new Date(`${endStr}T12:00:00Z`);

    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    while (cur <= last && days.length <= 62) {
      const iso = cur.toISOString().split('T')[0];
      const dIndex = cur.getUTCDay();
      days.push({
        date: iso,
        label: `${dayLabels[dIndex]} ${cur.getUTCDate()}`,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
  }

  private async assertBranch(branchId: string) {
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) {
      throw new BadRequestException('Sucursal no encontrada');
    }
  }
}
