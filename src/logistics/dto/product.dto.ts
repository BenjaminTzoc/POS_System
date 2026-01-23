import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  MaxLength,
  Min,
  isString,
  IsEnum,
  IsBoolean,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type, Exclude, Expose, Transform } from 'class-transformer';
import { PartialType, OmitType } from '@nestjs/mapped-types';
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

// Helper para transformar strings 'true'/'false' a booleanos
const TransformBoolean = () =>
  Transform(({ value, key }) => {
    console.log(`DEBUG TRANSFORM [${key}]:`, { value, type: typeof value });
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });

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
  @TransformBoolean()
  manageStock?: boolean | string;

  @IsOptional()
  @IsEnum(StockAvailability)
  stockAvailability?: StockAvailability;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InitialStockDto)
  initialStocks?: InitialStockDto[];

  @IsOptional()
  @IsBoolean()
  @TransformBoolean()
  isActive?: boolean | string;

  @IsOptional()
  @IsBoolean()
  @TransformBoolean()
  isVisible?: boolean | string;
}

// UpdateProductDto hereda todas las propiedades de CreateProductDto como opcionales,
// excepto 'initialStocks' que se omite.
// NOTA: Redefinimos los booleanos explícitamente porque PartialType a veces
// no hereda correctamente los decoradores @Transform de class-transformer.
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['initialStocks'] as const),
) {
  @IsOptional()
  @IsBoolean()
  @TransformBoolean()
  manageStock?: boolean | string;

  @IsOptional()
  @IsBoolean()
  @TransformBoolean()
  isActive?: boolean | string;

  @IsOptional()
  @IsBoolean()
  @TransformBoolean()
  isVisible?: boolean | string;
}

export class ProductResponseDto extends BaseEntity {
  @Expose()
  declare id: string;

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
  manageStock: boolean;

  @Expose()
  stockAvailability: StockAvailability;

  @Expose()
  inventories: any[];

  @Expose()
  isActive: boolean;

  @Expose()
  isVisible: boolean;

  @Expose()
  stock: number | null;

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

  @Expose()
  declare deletedAt: Date | null;
}

export class UpdateProductImageDto {
  @IsNotEmpty()
  @IsString()
  imageUrl: string;
}
