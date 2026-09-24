import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, IsEnum, IsDateString, IsBoolean, Min, MaxLength } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { PaymentStatus } from '../entities';
import { PaymentMethodResponseDto } from 'src/purchases/dto';
import { PartialType } from '@nestjs/mapped-types';

export class CreateSalePaymentDto {
  @IsNotEmpty()
  @IsUUID()
  saleId: string;

  @IsOptional()
  @IsString()
  paymentProcessor?: string;

  @IsOptional()
  @IsString()
  externalTransactionId?: string;

  @IsOptional()
  @IsString()
  paymentLinkId?: string;

  @IsNotEmpty()
  @IsUUID()
  paymentMethodId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceNumber?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  manualBankAccount?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDownPayment?: boolean;
}

export class UpdateSalePaymentDto extends PartialType(CreateSalePaymentDto) {}

export class SalePaymentResponseDto extends BaseEntity {
  @Expose()
  paymentProcessor: string;

  @Expose()
  externalTransactionId: string;

  @Expose()
  paymentLinkId: string;

  @Expose()
  amount: number;

  @Expose()
  date: Date;

  @Expose()
  referenceNumber: string;

  @Expose()
  @Type(() => Object)
  bankAccount: any;

  @Expose()
  manualBankAccount: string;

  @Expose()
  status: PaymentStatus;

  @Expose()
  isDownPayment: boolean;

  @Expose()
  notes: string;

  @Expose()
  @Type(() => PaymentMethodResponseDto)
  paymentMethod: PaymentMethodResponseDto;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}

export class SaleCustomerReceiptDto {
  @Expose()
  id?: string | null;

  @Expose()
  name: string;

  @Expose()
  nit?: string | null;

  @Expose()
  phone?: string | null;

  @Expose()
  email?: string | null;

  @Expose()
  address?: string | null;
}

export class SaleBranchReceiptDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  address?: string | null;

  @Expose()
  phone?: string | null;
}

export class SaleFinancialSummaryDto {
  @Expose()
  totalSale: number;

  @Expose()
  totalPaid: number;

  @Expose()
  currentPending: number;

  @Expose()
  isFullyPaid: boolean;
}

export class SalePaymentReceiptPaymentMethodDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  code?: string;
}

export class SalePaymentReceiptBankAccountDto {
  @Expose()
  id: string;

  @Expose()
  bankName: string;

  @Expose()
  accountNumber: string;
}

export class SalePaymentReceiptItemDto {
  @Expose()
  id: string;

  @Expose()
  date: Date;

  @Expose()
  amount: number;

  @Expose()
  previousBalance: number;

  @Expose()
  remainingBalance: number;

  @Expose()
  isDownPayment: boolean;

  @Expose()
  @Type(() => SalePaymentReceiptPaymentMethodDto)
  paymentMethod: SalePaymentReceiptPaymentMethodDto;

  @Expose()
  referenceNumber?: string | null;

  @Expose()
  @Type(() => SalePaymentReceiptBankAccountDto)
  bankAccount?: SalePaymentReceiptBankAccountDto | null;

  @Expose()
  manualBankAccount?: string | null;

  @Expose()
  notes?: string | null;

  @Expose()
  status: PaymentStatus;

  @Expose()
  createdAt: Date;
}

export class SalePaymentReceiptResponseDto {
  @Expose()
  saleId: string;

  @Expose()
  invoiceNumber: string;

  @Expose()
  saleDate: Date;

  @Expose()
  promisedDeliveryDate?: Date | null;

  @Expose()
  isPreorder: boolean;

  @Expose()
  saleStatus: string;

  @Expose()
  @Type(() => SaleCustomerReceiptDto)
  customer: SaleCustomerReceiptDto;

  @Expose()
  @Type(() => SaleBranchReceiptDto)
  branch?: SaleBranchReceiptDto | null;

  @Expose()
  @Type(() => SaleFinancialSummaryDto)
  financialSummary: SaleFinancialSummaryDto;

  @Expose()
  @Type(() => SalePaymentReceiptItemDto)
  payments: SalePaymentReceiptItemDto[];
}

export class IndividualPaymentReceiptResponseDto extends SalePaymentReceiptResponseDto {
  @Expose()
  @Type(() => SalePaymentReceiptItemDto)
  currentPayment: SalePaymentReceiptItemDto | null;
}
