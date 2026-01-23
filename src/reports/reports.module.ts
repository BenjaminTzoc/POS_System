import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale, SaleDetail } from '../sales/entities';
import { Inventory } from '../logistics/entities';
import { ReportsService } from './services/reports.service';
import { ReportsController } from './controllers/reports.controller';
import { LogisticsModule } from '../logistics/logistics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleDetail, Inventory]),
    LogisticsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
