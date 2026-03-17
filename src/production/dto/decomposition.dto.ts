import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DecompositionItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  costPercentage: number;
}

export class CreateDecompositionDto {
  @IsUUID()
  inputProductId: string;

  @IsUUID()
  branchId: string;

  @IsNumber()
  inputQuantity: number;

  @IsNumber()
  totalCost: number;

  @IsOptional()
  @IsNumber()
  wasteQuantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecompositionItemDto)
  items: DecompositionItemDto[];
}
