import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from '../services/reports.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { isSuperAdmin } from '../../utils/user-scope.util';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard/summary')
  async getDashboardSummary(
    @User() user: any,
    @Query('branchId') branchIdQuery?: string,
  ): Promise<DashboardSummaryDto> {
    // Si es SuperAdmin puede ver todo o filtrar por branchIdQuery
    // Si NO es SuperAdmin, se limita a su propia sucursal
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;

    return this.reportsService.getDashboardSummary(branchId);
  }

  @Get('sales/trends')
  async getSalesTrends(
    @User() user: any,
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchIdQuery?: string,
  ): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const numDays = days ? parseInt(days, 10) : 7;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getSalesTrends(numDays, branchId, sDate, eDate);
  }

  @Get('products/top-selling')
  async getTopSellingProducts(
    @User() user: any,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchIdQuery?: string,
  ): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const numLimit = limit ? parseInt(limit, 10) : 5;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getTopSellingProducts(
      numLimit,
      branchId,
      sDate,
      eDate,
    );
  }

  @Get('categories/distribution')
  async getCategoryDistribution(
    @User() user: any,
    @Query('branchId') branchIdQuery?: string,
  ): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;

    return this.reportsService.getCategoryDistribution(branchId);
  }

  @Get('sales/payment-methods')
  async getSalesByPaymentMethod(
    @User() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchIdQuery?: string,
  ): Promise<any[]> {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;

    return this.reportsService.getSalesByPaymentMethod(branchId, sDate, eDate);
  }
}
