import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class CustomerWeeklySummaryQueryDto {
  @IsNotEmpty({ message: 'weekStartDate es obligatorio' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'weekStartDate debe ser YYYY-MM-DD' })
  weekStartDate: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export type WeekDayLabel = 'Lun' | 'Mar' | 'Mié' | 'Jue' | 'Vie' | 'Sáb' | 'Dom';

export interface CustomerWeeklyDayDto {
  date: string;
  day: WeekDayLabel;
  total: number;
  orderCount: number;
}

export interface CustomerWeeklyMixItemDto {
  productId: string | null;
  productName: string;
  quantity: number;
  unit: string;
  revenue: number;
  share: number;
}

export interface CustomerWeeklyItemDto {
  id: string | null;
  name: string;
  isGuest: boolean;
  category: {
    id: string | null;
    name: string;
  };
  total: number;
  orderCount: number;
  averageTicket: number;
  trendPercent: number;
  paidAmount: number;
  pendingAmount: number;
  creditLimit: number;
  creditUsed: number;
  lastPurchaseDate: string | null;
  inactiveThisWeek: boolean;
  preorderCommitted: number;
  topProduct: {
    productId: string | null;
    name: string;
    quantity: number;
    unit: string;
  } | null;
  mix: CustomerWeeklyMixItemDto[];
  days: CustomerWeeklyDayDto[];
}

export interface CustomerWeeklyKpisDto {
  topCustomer: { id: string | null; name: string; total: number } | null;
  averageTicket: number;
  top5Concentration: number;
  pendingAmount: number;
  activeCustomerCount: number;
}

export interface CustomerWeeklySummaryDto {
  period: {
    start: string;
    end: string;
  };
  kpis: CustomerWeeklyKpisDto;
  customers: CustomerWeeklyItemDto[];
}
