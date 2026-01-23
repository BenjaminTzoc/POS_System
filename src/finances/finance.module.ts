import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterService } from './services/cash-register.service';
import { CashRegisterController } from './controllers/cash-register.controller';
import { SalePayment } from '../sales/entities/sale-payment.entity';
import { PaymentMethod } from '../purchases/entities/payment-method.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CashRegister, SalePayment, PaymentMethod]),
  ],
  controllers: [CashRegisterController],
  providers: [CashRegisterService],
  exports: [CashRegisterService],
})
export class FinanceModule {}
