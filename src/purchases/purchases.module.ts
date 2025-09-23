import { Module } from '@nestjs/common';
import { PaymentMethodService, PurchasePaymentService, PurchaseService, SupplierService } from './services';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentMethod, Purchase, PurchaseDetail, PurchasePayment, Supplier } from './entities';
import { PaymentMethodController, PurchaseController, PurchasePaymentController, SupplierController } from './controllers';
import { LogisticsModule } from 'src/logistics/logistics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      PaymentMethod,
      Purchase,
      PurchaseDetail,
      PurchasePayment,
    ]),
    LogisticsModule,
  ],
  controllers: [SupplierController, PaymentMethodController, PurchaseController, PurchasePaymentController],
  providers: [SupplierService, PaymentMethodService, PurchaseService, PurchasePaymentService],
  exports: [SupplierService, PaymentMethodService, PurchaseService, PurchasePaymentService],
})
export class PurchasesModule {}
