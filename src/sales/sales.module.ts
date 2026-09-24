import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerCategoryService, CustomerService, DiscountCodeService, SaleDetailService, SalePaymentService, SaleService, QuotationService, SaleFolderService } from './services';
import { Customer, CustomerCategory, DiscountCode, Sale, SaleDetail, SalePayment, Quotation, QuotationItem, QuotationDiscount, SaleFolder, SaleFolderItem } from './entities';
import { CustomerCategoryController, CustomerController, DiscountCodeController, SaleController, SaleDetailController, SalePaymentController, QuotationController, SaleFolderController } from './controllers';
import { LogisticsModule } from 'src/logistics/logistics.module';
import { PurchasesModule } from 'src/purchases/purchases.module';
import { FinanceModule } from 'src/finances/finance.module';
import { SaleGateway } from './gateway/sale.gateway';
import { BillingReminderJob } from './jobs/billing-reminder.job';
import { Branch, Product } from 'src/logistics/entities';
import { MailModule } from 'src/common/mail/mail.module';
import { PdfModule } from 'src/common/pdf/pdf.module';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerCategory, Customer, DiscountCode, Sale, SalePayment, SaleDetail, Branch, Product, Quotation, QuotationItem, QuotationDiscount, SaleFolder, SaleFolderItem]), LogisticsModule, PurchasesModule, FinanceModule, MailModule, PdfModule],
  controllers: [CustomerCategoryController, CustomerController, DiscountCodeController, SaleController, SalePaymentController, SaleDetailController, QuotationController, SaleFolderController],
  providers: [CustomerCategoryService, CustomerService, DiscountCodeService, SaleService, SalePaymentService, SaleDetailService, QuotationService, SaleGateway, BillingReminderJob, SaleFolderService],
  exports: [CustomerCategoryService, CustomerService, DiscountCodeService, SaleService, SalePaymentService, SaleDetailService, QuotationService, SaleGateway, SaleFolderService],
})
export class SalesModule {}
