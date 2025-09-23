import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, IsEnum, IsDateString, Min, MaxLength } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { PaymentStatus } from '../entities';
import { PaymentMethodResponseDto } from '.';

export class CreatePurchasePaymentDto {
  @IsNotEmpty()
  @IsUUID()
  purchaseId: string;

  @IsNotEmpty()
  @IsUUID()
  paymentMethodId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccount?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePurchasePaymentDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccount?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PurchasePaymentResponseDto extends BaseEntity {
  @Expose()
  amount: number;

  @Expose()
  date: Date;

  @Expose()
  referenceNumber: string;

  @Expose()
  bankAccount: string;

  @Expose()
  status: PaymentStatus;

  @Expose()
  notes: string;

  @Expose()
  @Type(() => PaymentMethodResponseDto)
  paymentMethod: PaymentMethodResponseDto;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}