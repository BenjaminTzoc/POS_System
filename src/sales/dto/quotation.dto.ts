import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type, Expose } from 'class-transformer';
import { QuotationStatus } from '../entities/quotation.entity';
import { DiscountType } from '../entities/discount-code.entity';
import { QuotationAdjustmentType, QuotationValueType } from '../entities/quotation-discount.entity';

export class CreateQuotationItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lineTotal?: number;
}

export class CreateQuotationAdjustmentDto {
  @IsEnum(QuotationAdjustmentType)
  adjustmentType: QuotationAdjustmentType;

  @IsEnum(QuotationValueType)
  valueType: QuotationValueType;

  @IsNumber()
  @Min(0)
  value: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateQuotationDto {
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  branchId: string;

  @IsNumber()
  @IsOptional()
  validityDays?: number = 15;

  @IsBoolean()
  @IsOptional()
  applyTax?: boolean = true;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items: CreateQuotationItemDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationAdjustmentDto)
  adjustments?: CreateQuotationAdjustmentDto[];

  @IsOptional()
  guestCustomer?: {
    name: string;
    phone?: string;
    email?: string;
    nit?: string;
    address?: string;
  };
}

export class UpdateQuotationStatusDto {
  @IsEnum(QuotationStatus)
  status: QuotationStatus;
}

export class QuotationItemResponseDto {
  @Expose()
  id: string;

  @Expose()
  productId: string;

  @Expose()
  productName: string;

  @Expose()
  productSku: string;

  @Expose()
  productImage: string;

  @Expose()
  quantity: number;

  @Expose()
  unitPrice: number;

  @Expose()
  discount: number;

  @Expose()
  discountAmount: number;

  @Expose()
  discountType: DiscountType;

  @Expose()
  taxPercentage: number;

  @Expose()
  taxAmount: number;

  @Expose()
  lineTotal: number;

  @Expose()
  subtotal: number;

  @Expose()
  notes: string;
}

export class QuotationAdjustmentResponseDto {
  @Expose()
  id: string;

  @Expose()
  adjustmentType: QuotationAdjustmentType;

  @Expose()
  valueType: QuotationValueType;

  @Expose()
  value: number;

  @Expose()
  amountApplied: number;

  @Expose()
  reason: string;
}

export class QuotationResponseDto {
  @Expose()
  id: string;

  @Expose()
  correlative: string;

  @Expose()
  validUntil: Date;

  @Expose()
  status: QuotationStatus;

  @Expose()
  notes: string;

  @Expose()
  applyTax: boolean;

  @Expose()
  subtotal: number;

  @Expose()
  taxAmount: number;

  @Expose()
  discountAmount: number;

  @Expose()
  total: number;

  @Expose()
  customerId: string | null;

  @Expose()
  customerName: string;

  @Expose()
  guestCustomer: any;

  @Expose()
  branchId: string;

  @Expose()
  branchName: string;

  @Expose()
  createdBy: string;

  @Expose()
  createdAt: Date;

  @Expose()
  saleId: string | null;

  @Expose()
  @Type(() => QuotationItemResponseDto)
  items: QuotationItemResponseDto[];

  @Expose()
  @Type(() => QuotationAdjustmentResponseDto)
  adjustments: QuotationAdjustmentResponseDto[];
}
