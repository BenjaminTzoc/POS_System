import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class TodayPulseQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  lowStockLimit?: number;
}

export interface TodayPulseSalesDto {
  total: number;
  previousTotal: number;
  changePercent: number;
  ticketCount: number;
  averageTicket: number;
  cashToday: number;
  creditToday: number;
  otherToday: number;
  peakHour: {
    hour: number | null;
    label: string | null;
  };
}

export interface TodayPulsePendingDto {
  total: number;
  preparing: number;
  delivery: number;
  preorder: number;
  oldestMinutes: number | null;
  nextCustomer: {
    saleId: string;
    name: string;
  } | null;
}

export interface TodayPulseReceivableDto {
  total: number;
  overdue: number;
  dueToday: number;
  invoiceCount: number;
  topDebtor: {
    customerId: string | null;
    name: string;
    amount: number;
  } | null;
}

export interface TodayPulseAttentionDto {
  lowStockCount: number;
  preordersForToday: number;
  lowStock: Array<{
    productId: string;
    name: string;
    quantity: number;
    unit: string;
    branchName?: string;
  }>;
}

export interface TodayPulseDto {
  date: string;
  currency: 'GTQ';
  sales: TodayPulseSalesDto;
  pending: TodayPulsePendingDto;
  receivable: TodayPulseReceivableDto;
  attention: TodayPulseAttentionDto;
}
