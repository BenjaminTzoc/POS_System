import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, IsEnum, IsDateString, Min, Max, IsBoolean } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { DiscountScope, DiscountType } from '../entities';

export class CreateDiscountCodeDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  description: string | null;

  @IsNotEmpty()
  @IsEnum(DiscountType)
  type: DiscountType;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  value: number;

  @IsNotEmpty()
  @IsEnum(DiscountScope)
  scope: DiscountScope;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPurchaseAmount: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit: number | null;

  @IsNotEmpty()
  @IsDateString()
  validFrom: string;

  @IsNotEmpty()
  @IsDateString()
  validUntil: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  customerCategoryId: string | null;

  @IsOptional()
  @IsUUID()
  productId: string | null;

  @IsOptional()
  @IsUUID()
  customerId: string | null;
}

export class UpdateDiscountCodeDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DiscountType)
  type?: DiscountType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsEnum(DiscountScope)
  scope?: DiscountScope;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPurchaseAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  customerCategoryId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class DiscountCodeResponseDto extends BaseEntity {
  @Expose()
  code: string;

  @Expose()
  description: string;

  @Expose()
  type: DiscountType;

  @Expose()
  value: number;

  @Expose()
  scope: DiscountScope;

  @Expose()
  minPurchaseAmount: number;

  @Expose()
  maxDiscountAmount: number;

  @Expose()
  usageLimit: number;

  @Expose()
  usedCount: number;

  @Expose()
  validFrom: Date;

  @Expose()
  validUntil: Date;

  @Expose()
  isActive: boolean;

  @Expose()
  customerCategoryId: string;

  @Expose()
  productId: string;

  @Expose()
  customerId: string;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}