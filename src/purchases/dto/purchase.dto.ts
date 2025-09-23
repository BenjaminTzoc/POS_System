import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, IsEnum, IsDateString, Min, ValidateNested, IsArray, MaxLength } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { SupplierResponseDto } from './supplier.dto';
import { PurchaseStatus } from '../entities/purchase.entity';
import { CreatePurchaseDetailDto, PurchaseDetailResponseDto, PurchasePaymentResponseDto } from '.';

export class CreatePurchaseDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  invoiceNumber: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  supplierId: string;

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
  total?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseDetailDto)
  details: CreatePurchaseDetailDto[];
}

export class UpdatePurchaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

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
  @IsString()
  notes?: string;
}

export class PurchaseResponseDto extends BaseEntity {
  @Expose()
  invoiceNumber: string;

  @Expose()
  date: Date;

  @Expose()
  dueDate: Date;

  @Expose()
  status: PurchaseStatus;

  @Expose()
  subtotal: number;

  @Expose()
  taxAmount: number;

  @Expose()
  discountAmount: number;

  @Expose()
  total: number;

  @Expose()
  paidAmount: number;

  @Expose()
  pendingAmount: number;

  @Expose()
  notes: string;

  @Expose()
  @Type(() => SupplierResponseDto)
  supplier: SupplierResponseDto;

  @Expose()
  @Type(() => PurchaseDetailResponseDto)
  details: PurchaseDetailResponseDto[];

  @Expose()
  @Type(() => PurchasePaymentResponseDto)
  payments: PurchasePaymentResponseDto[];

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}