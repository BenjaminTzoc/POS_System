import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OrdersReportService } from '../services/orders-report.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { isSuperAdmin } from '../../common/utils/user-scope.util';

@Controller('reports/orders')
@UseGuards(JwtAuthGuard)
export class OrdersReportController {
  constructor(private readonly ordersReportService: OrdersReportService) {}

  @Get('summary')
  async getOrdersSummary(@User() user: any, @Query('branchId') branchIdQuery?: string) {
    const branchId = isSuperAdmin(user) ? branchIdQuery : user.branch?.id;
    return this.ordersReportService.getOrdersSummary(branchId);
  }
}
