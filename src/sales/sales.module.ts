import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerCategoryService, CustomerService, DiscountCodeService, SaleDetailService, SalePaymentService, SaleService } from './services';
import { Customer, CustomerCategory, DiscountCode, Sale, SaleDetail, SalePayment } from './entities';
import { CustomerCategoryController, CustomerController, DiscountCodeController, SaleController, SaleDetailController, SalePaymentController } from './controllers';
import { LogisticsModule } from 'src/logistics/logistics.module';
import { PurchasesModule } from 'src/purchases/purchases.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerCategory,
      Customer,
      DiscountCode,
      Sale,
      SalePayment,
      SaleDetail,
    ]),
    LogisticsModule,
    PurchasesModule,
  ],
  controllers: [CustomerCategoryController, CustomerController, DiscountCodeController, SaleController, SalePaymentController, SaleDetailController],
  providers: [CustomerCategoryService, CustomerService, DiscountCodeService, SaleService, SalePaymentService, SaleDetailService],
  exports: [CustomerCategoryService, CustomerService, DiscountCodeService, SaleService, SalePaymentService, SaleDetailService],
})
export class SalesModule {}
