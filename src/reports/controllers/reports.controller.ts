import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from '../services/reports.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { isSuperAdmin } from '../../common/utils/user-scope.util';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  async getUnifiedDashboard(@User() user: any, @Query('days') days?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('branchId') branchIdQuery?: string): Promise<any> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const numDays = days ? parseInt(days, 10) : 7;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getUnifiedDashboard(branchId, numDays, sDate, eDate);
  }

  @Get('sales/trends')
  async getSalesTrends(@User() user: any, @Query('days') days?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('branchId') branchIdQuery?: string, @Query('frequency') frequency: 'day' | 'week' | 'month' | 'year' = 'day'): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const numDays = days ? parseInt(days, 10) : 7;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getSalesTrends(branchId, numDays, sDate, eDate, frequency);
  }

  @Get('products/performance')
  async getProductPerformance(@User() user: any, @Query('limit') limit?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('branchId') branchIdQuery?: string, @Query('frequency') frequency: 'day' | 'week' | 'month' | 'year' | 'custom' = 'week'): Promise<any> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const numLimit = limit ? parseInt(limit, 10) : 10;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getProductPerformance(numLimit, branchId, sDate, eDate, frequency);
  }

  @Get('categories/sales')
  async getCategorySales(@User() user: any, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('branchId') branchIdQuery?: string, @Query('frequency') frequency: 'day' | 'week' | 'month' | 'year' | 'custom' = 'week'): Promise<any> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getCategorySales(branchId, sDate, eDate, frequency);
  }

  @Get('branches/performance')
  async getBranchPerformance(@User() user: any, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('frequency') frequency: 'day' | 'week' | 'month' | 'year' | 'custom' = 'week', @Query('sortBy') sortBy: 'revenue' | 'count' | 'average' = 'revenue', @Query('order') order: 'ASC' | 'DESC' = 'DESC', @Query('branchId') branchIdQuery?: string): Promise<any> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getBranchPerformance(branchId, sDate, eDate, frequency, sortBy, order);
  }

  @Get('inventory/critical-stock')
  async getCriticalStock(@User() user: any, @Query('branchId') branchIdQuery?: string): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    return this.reportsService.getCriticalStockReport(branchId);
  }

  @Get('sales/hourly')
  async getHourlySales(@User() user: any, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('branchId') branchIdQuery?: string): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getHourlySalesDistribution(branchId, sDate, eDate);
  }

  @Get('inventory/waste/trends')
  async getWasteTrends(@User() user: any, @Query('days') days?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('branchId') branchIdQuery?: string): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const numDays = days ? parseInt(days, 10) : 30;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getWasteTrends(branchId, numDays, sDate, eDate);
  }

  @Get('inventory/waste/products')
  async getWasteByProduct(@User() user: any, @Query('limit') limit?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('branchId') branchIdQuery?: string): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const numLimit = limit ? parseInt(limit, 10) : 10;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getWasteByProduct(branchId, numLimit, sDate, eDate);
  }

  @Get('dashboard/calendar')
  async getDashboardCalendar(@User() user: any, @Query('month') month: string, @Query('year') year: string, @Query('branchId') branchIdQuery?: string): Promise<any> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const now = new Date();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;
    const y = year ? parseInt(year, 10) : now.getFullYear();
    return this.reportsService.getDashboardCalendar(m, y, branchId);
  }

  @Get('branches/weekly-consolidation')
  async getWeeklyBranchConsolidated(@User() user: any, @Query('month') month?: string, @Query('year') year?: string, @Query('branchId') branchIdQuery?: string): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const m = month ? parseInt(month, 10) : undefined;
    const y = year ? parseInt(year, 10) : undefined;

    return this.reportsService.getWeeklyBranchConsolidated(m, y, branchId);
  }

  @Get('products/weekly-consolidation')
  async getWeeklyProductConsolidated(@User() user: any, @Query('weekStartDate') weekStartDate: string, @Query('branchId') branchIdQuery?: string): Promise<any> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    return this.reportsService.getWeeklyProductConsolidated(weekStartDate, branchId);
  }

  @Get('customers/weekly-consolidation')
  async getWeeklyCustomerConsolidated(@User() user: any, @Query('weekStartDate') weekStartDate: string, @Query('branchId') branchIdQuery?: string): Promise<any> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    return this.reportsService.getWeeklyCustomerConsolidated(weekStartDate, branchId);
  }

  @Get('products/monthly-trends')
  async getMonthlyProductSalesTrends(@User() user: any, @Query('month') month?: string, @Query('year') year?: string, @Query('limit') limit?: string, @Query('page') page?: string, @Query('branchId') branchIdQuery?: string): Promise<any> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const m = month ? parseInt(month, 10) : undefined;
    const y = year ? parseInt(year, 10) : undefined;
    const l = limit ? parseInt(limit, 10) : 5;
    const p = page ? parseInt(page, 10) : 1;

    return this.reportsService.getMonthlyProductSalesTrends(m, y, branchId, l, p);
  }
}
