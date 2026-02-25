import { Injectable } from '@nestjs/common';
import { SalesReportsService } from './sales-reports.service';
import { InventoryReportsService } from './inventory-reports.service';
import { ConsolidatedReportsService } from './consolidated-reports.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly salesReports: SalesReportsService,
    private readonly inventoryReports: InventoryReportsService,
    private readonly consolidatedReports: ConsolidatedReportsService,
  ) {}

  // 1. Actividad en ventas (Trends)
  getSalesTrends(branchId?: string, days: number = 7, start?: Date, end?: Date, frequency?: any) {
    return this.salesReports.getSalesTrends(branchId, days, start, end, frequency);
  }

  // 2. Ventas por categoría
  getCategorySales(branchId?: string, start?: Date, end?: Date, frequency?: any) {
    return this.salesReports.getCategorySales(branchId, start, end, frequency);
  }

  // 3. Rendimiento de productos
  getProductPerformance(limit: number = 10, branchId?: string, start?: Date, end?: Date, frequency?: any) {
    return this.salesReports.getProductPerformance(limit, branchId, start, end, frequency);
  }

  // 4. Rendimiento de sucursales
  getBranchPerformance(branchId?: string, start?: Date, end?: Date, frequency?: any, sortBy?: any, order?: any) {
    return this.salesReports.getBranchPerformance(branchId, start, end, frequency, sortBy, order);
  }

  // 5. Alertas de inventario
  getCriticalStockReport(branchId?: string) {
    return this.inventoryReports.getCriticalStockReport(branchId);
  }

  // 6. Picos por hora
  getHourlySalesDistribution(branchId?: string, start?: Date, end?: Date) {
    return this.salesReports.getHourlySalesDistribution(branchId, start, end);
  }

  // 7. Merma por periodo
  getWasteTrends(branchId?: string, days: number = 30, start?: Date, end?: Date) {
    return this.inventoryReports.getWasteTrends(branchId, days, start, end);
  }

  // 8. Merma por producto
  getWasteByProduct(branchId?: string, limit: number = 10, start?: Date, end?: Date) {
    return this.inventoryReports.getWasteByProduct(branchId, limit, start, end);
  }

  // 10. Dashboard Unificado
  async getUnifiedDashboard(branchId?: string, days: number = 7, startDate?: Date, endDate?: Date) {
    const [trends, categories, products, criticalStock] = await Promise.all([this.getSalesTrends(branchId, days, startDate, endDate), this.getCategorySales(branchId, startDate, endDate), this.getProductPerformance(5, branchId, startDate, endDate), this.getCriticalStockReport(branchId)]);

    return {
      trends,
      categories,
      products,
      criticalStock: criticalStock.slice(0, 10),
    };
  }

  // 11. Calendario
  getDashboardCalendar(month: number, year: number, branchId?: string) {
    return this.consolidatedReports.getDashboardCalendar(month, year, branchId);
  }

  // 12. Consolidado Semanal Branch
  getWeeklyBranchConsolidated(month?: number, year?: number, branchId?: string) {
    return this.consolidatedReports.getWeeklyBranchConsolidated(month, year, branchId);
  }

  // 13. Consolidado Semanal Product
  getWeeklyProductConsolidated(weekStartDate: string, branchId?: string) {
    return this.consolidatedReports.getWeeklyProductConsolidated(weekStartDate, branchId);
  }

  // 14. Consolidado Semanal Customer
  getWeeklyCustomerConsolidated(weekStartDate: string, branchId?: string) {
    return this.consolidatedReports.getWeeklyCustomerConsolidated(weekStartDate, branchId);
  }

  // 15. Tendencias mensuales por producto
  getMonthlyProductSalesTrends(month?: number, year?: number, branchId?: string, limit?: number, page?: number) {
    return this.salesReports.getMonthlyProductSalesTrends(month, year, branchId, limit, page);
  }
}
