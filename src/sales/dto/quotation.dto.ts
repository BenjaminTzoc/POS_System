import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type, Expose } from 'class-transformer';
import { QuotationStatus } from '../entities/quotation.entity';

export class CreateQuotationItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
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

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items: CreateQuotationItemDto[];

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
  subtotal: number;
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
  subtotal: number;

  @Expose()
  taxAmount: number;

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
}
