import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, IsEnum, IsDateString, Min, Max, ValidateNested, IsArray } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from 'typeorm';
import { SaleStatus, SaleType } from '../entities';
import { CreateSaleDetailDto, CustomerResponseDto, DiscountCodeResponseDto, SaleDetailResponseDto, SalePaymentResponseDto } from '.';

export class CreateSaleDto {
  @IsNotEmpty()
  @IsString()
  invoiceNumber: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsOptional()
  @IsEnum(SaleType)
  type?: SaleType;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  discountCodeId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPointsRedeemed?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleDetailDto)
  details: CreateSaleDetailDto[];
}

export class UpdateSaleDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(SaleType)
  type?: SaleType;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  categoryDiscount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  codeDiscount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pendingAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPointsEarned?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPointsRedeemed?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SaleResponseDto extends BaseEntity {
  @Expose()
  invoiceNumber: string;

  @Expose()
  date: Date;

  @Expose()
  type: SaleType;

  @Expose()
  status: SaleStatus;

  @Expose()
  subtotal: number;

  @Expose()
  taxAmount: number;

  @Expose()
  discountAmount: number;

  @Expose()
  categoryDiscount: number;

  @Expose()
  codeDiscount: number;

  @Expose()
  total: number;

  @Expose()
  paidAmount: number;

  @Expose()
  pendingAmount: number;

  @Expose()
  loyaltyPointsEarned: number;

  @Expose()
  loyaltyPointsRedeemed: number;

  @Expose()
  notes: string;

  @Expose()
  @Type(() => CustomerResponseDto)
  customer: CustomerResponseDto | null;

  @Expose()
  @Type(() => DiscountCodeResponseDto)
  discountCode: DiscountCodeResponseDto | null;

  @Expose()
  @Type(() => SaleDetailResponseDto)
  details: SaleDetailResponseDto[];

  @Expose()
  @Type(() => SalePaymentResponseDto)
  payments: SalePaymentResponseDto[];

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}