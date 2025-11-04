import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, MaxLength, Min, isString, IsEnum, IsBoolean, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { CategoryResponseDto } from './category.dto';
import { UnitResponseDto } from './unit.dto';
import { StockAvailability } from '../entities/product.entity';

class InitialStockDto {
  @IsNotEmpty()
  @IsUUID()
  branchId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  quantity: number;
}

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  sku: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  cost: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  price: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsBoolean()
  manageStock?: boolean;

  @IsOptional()
  @IsEnum(StockAvailability)
  stockAvailability?: StockAvailability;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InitialStockDto)
  initialStocks?: InitialStockDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsBoolean()
  manageStock?: boolean;

  @IsOptional()
  @IsEnum(StockAvailability)
  stockAvailability?: StockAvailability;
}

export class ProductResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  description: string;

  @Expose()
  sku: string;

  @Expose()
  barcode: string;

  @Expose()
  cost: number;

  @Expose()
  price: number;

  @Expose()
  imageUrl: string | null;

  @Expose()
  @Type(() => CategoryResponseDto)
  category: CategoryResponseDto | null;

  @Expose()
  @Type(() => UnitResponseDto)
  unit: UnitResponseDto | null;

  @Exclude()
  declare createdAt: Date;

  @Exclude()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}

export class UpdateProductImageDto {
  @IsNotEmpty()
  @IsString()
  imageUrl: string;
}