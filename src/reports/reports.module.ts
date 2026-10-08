import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, Sale, SaleDetail, SalePayment } from '../sales/entities';
import { Inventory, InventoryMovement, Product, Branch, Category } from '../logistics/entities';
import { PdfModule } from '../common/pdf/pdf.module';
import { ReportsService } from './services/reports.service';
import { SalesReportsService } from './services/sales-reports.service';
import { InventoryReportsService } from './services/inventory-reports.service';
import { ConsolidatedReportsService } from './services/consolidated-reports.service';
import { OrdersReportService } from './services/orders-report.service';
import { CustomerWeeklySummaryService } from './services/customer-weekly-summary.service';
import { TodayPulseService } from './services/today-pulse.service';
import { TodayPaymentsService } from './services/today-payments.service';
import { TopProductsSummaryService } from './services/top-products-summary.service';
import { StockRunwayService } from './services/stock-runway.service';
import { ReportsController } from './controllers/reports.controller';
import { OrdersReportController } from './controllers/orders-report.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Sale, SaleDetail, SalePayment, Inventory, InventoryMovement, Product, Branch, Category]),
    PdfModule,
  ],
  controllers: [ReportsController, OrdersReportController],
  providers: [ReportsService, SalesReportsService, InventoryReportsService, ConsolidatedReportsService, OrdersReportService, CustomerWeeklySummaryService, TodayPulseService, TodayPaymentsService, TopProductsSummaryService, StockRunwayService],
  exports: [ReportsService, SalesReportsService, InventoryReportsService, ConsolidatedReportsService, OrdersReportService, CustomerWeeklySummaryService, TodayPulseService, TodayPaymentsService, TopProductsSummaryService, StockRunwayService],
})
export class ReportsModule {}


