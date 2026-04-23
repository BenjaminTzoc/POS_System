import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerCategoryService, CustomerService, DiscountCodeService, SaleDetailService, SalePaymentService, SaleService, QuotationService } from './services';
import { Customer, CustomerCategory, DiscountCode, Sale, SaleDetail, SalePayment, Quotation, QuotationItem, QuotationDiscount } from './entities';
import { CustomerCategoryController, CustomerController, DiscountCodeController, SaleController, SaleDetailController, SalePaymentController, QuotationController } from './controllers';
import { LogisticsModule } from 'src/logistics/logistics.module';
import { PurchasesModule } from 'src/purchases/purchases.module';
import { FinanceModule } from 'src/finances/finance.module';
import { SaleGateway } from './gateway/sale.gateway';
import { Branch, Product } from 'src/logistics/entities';
import { MailModule } from 'src/common/mail/mail.module';
import { PdfModule } from 'src/common/pdf/pdf.module';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerCategory, Customer, DiscountCode, Sale, SalePayment, SaleDetail, Branch, Product, Quotation, QuotationItem, QuotationDiscount]), LogisticsModule, PurchasesModule, FinanceModule, MailModule, PdfModule],
  controllers: [CustomerCategoryController, CustomerController, DiscountCodeController, SaleController, SalePaymentController, SaleDetailController, QuotationController],
  providers: [CustomerCategoryService, CustomerService, DiscountCodeService, SaleService, SalePaymentService, SaleDetailService, QuotationService, SaleGateway],
  exports: [CustomerCategoryService, CustomerService, DiscountCodeService, SaleService, SalePaymentService, SaleDetailService, QuotationService, SaleGateway],
})
export class SalesModule {}
