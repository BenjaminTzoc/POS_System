import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, MaxLength, Min } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { CategoryResponseDto } from './category.dto';
import { UnitResponseDto } from './unit.dto';

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
  @Min(0)
  price: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;
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
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;
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
  @Type(() => CategoryResponseDto)
  category: CategoryResponseDto | null;

  @Expose()
  @Type(() => UnitResponseDto)
  unit: UnitResponseDto | null;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}