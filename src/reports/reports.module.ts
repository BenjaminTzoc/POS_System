import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale, SaleDetail } from '../sales/entities';
import { Inventory, InventoryMovement } from '../logistics/entities';
import { Purchase } from '../purchases/entities';
import { ReportsService } from './services/reports.service';
import { ReportsController } from './controllers/reports.controller';
import { LogisticsModule } from '../logistics/logistics.module';
import { PurchasesModule } from '../purchases/purchases.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleDetail,
      Inventory,
      InventoryMovement,
      Purchase,
    ]),
    LogisticsModule,
    PurchasesModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
