import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { BankAccount } from './entities/bank-account.entity';
import { CashRegisterService } from './services/cash-register.service';
import { BankAccountService } from './services/bank-account.service';
import { CashRegisterController } from './controllers/cash-register.controller';
import { BankAccountController } from './controllers/bank-account.controller';
import { SalePayment } from '../sales/entities/sale-payment.entity';
import { PaymentMethod } from '../purchases/entities/payment-method.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CashRegister, BankAccount, SalePayment, PaymentMethod])],
  controllers: [CashRegisterController, BankAccountController],
  providers: [CashRegisterService, BankAccountService],
  exports: [CashRegisterService, BankAccountService],
})
export class FinanceModule {}
