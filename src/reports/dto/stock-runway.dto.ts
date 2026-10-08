import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class StockRunwayQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'branchId debe ser un UUID válido' })
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(90)
  velocityDays?: number = 14;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export type RunwayRiskLevel = 'critical' | 'warning' | 'reorder' | 'healthy';

export interface StockRunwayItemDto {
  productId: string;
  productName: string;
  sku?: string;
  categoryName: string;
  unit: string;
  branchName?: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  minStock: number;
  dailyVelocity: number;
  daysRemaining: number | null;
  riskLevel: RunwayRiskLevel;
  riskMessage: string;
}

export interface StockRunwayKpisDto {
  criticalCount: number;
  warningCount: number;
  belowMinCount: number;
  totalReservedUnits: number;
}

export interface StockRunwayResponseDto {
  kpis: StockRunwayKpisDto;
  items: StockRunwayItemDto[];
}
