import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class TopProductsSummaryQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'startDate debe ser una fecha válida (YYYY-MM-DD)' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate debe ser una fecha válida (YYYY-MM-DD)' })
  endDate?: string;

  @IsOptional()
  @IsUUID('4', { message: 'branchId debe ser un UUID válido' })
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: 'revenue' | 'quantity' = 'revenue';
}

export interface TopProductDailySaleDto {
  date: string;
  dayLabel: string;
  total: number;
  quantity: number;
}

export interface TopProductItemDto {
  productId: string;
  productName: string;
  sku?: string;
  categoryName: string;
  unit: string;
  quantity: number;
  revenue: number;
  orderCount: number;
  averagePrice: number;
  percentage: number;
  sparkline: TopProductDailySaleDto[];
}

export interface TopProductsKpisDto {
  totalRevenue: number;
  totalUnitsSold: number;
  totalProductsCount: number;
  leaderProduct: {
    productId: string;
    productName: string;
    revenue: number;
    quantity: number;
    unit: string;
  } | null;
  leaderCategory: {
    categoryName: string;
    revenue: number;
    percentage: number;
  } | null;
}

export interface TopProductsSummaryDto {
  period: {
    startDate: string;
    endDate: string;
  };
  kpis: TopProductsKpisDto;
  products: TopProductItemDto[];
}
