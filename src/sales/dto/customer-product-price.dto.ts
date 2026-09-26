import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';

export class UpsertCustomerProductPriceDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;
}

export class UpdateCustomerProductPriceDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;
}

export class CustomerProductPriceProductDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  sku: string;

  @Expose()
  price: number;
}

export class CustomerProductPriceResponseDto extends BaseEntity {
  @Expose()
  price: number;

  @Expose()
  isActive: boolean;

  @Expose()
  validFrom: Date | null;

  @Expose()
  validUntil: Date | null;

  @Expose()
  @Type(() => CustomerProductPriceProductDto)
  product: CustomerProductPriceProductDto;

  @Expose()
  listPrice: number;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;
}

export class AppliedProductPriceDto {
  @Expose()
  productId: string;

  @Expose()
  listPrice: number;

  @Expose()
  price: number;

  @Expose()
  source: 'custom' | 'list';
}
