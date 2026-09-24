import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class TodayPaymentsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export type TodayPaymentMethodCode = 'cash' | 'transfer' | 'card' | 'other';

export interface TodayPaymentsSummaryDto {
  total: number;
  count: number;
  cash: number;
  transfer: number;
  other: number;
  settled: number;
}

export interface TodayPaymentItemDto {
  id: string;
  saleId: string;
  invoiceNumber: string;
  customerName: string;
  customerId: string | null;
  amount: number;
  remainingBalance: number;
  methodCode: TodayPaymentMethodCode;
  methodName: string;
  paidAt: string;
  time: string;
  reference: string | null;
  isDownPayment: boolean;
  branchName: string;
  branchId: string;
}

export interface TodayPaymentsDto {
  date: string;
  currency: 'GTQ';
  summary: TodayPaymentsSummaryDto;
  payments: TodayPaymentItemDto[];
}
