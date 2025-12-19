import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsEnum,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { PaymentStatus } from '../entities';
import { PaymentMethodResponseDto } from 'src/purchases/dto';
import { PartialType } from '@nestjs/mapped-types';

export class CreateSalePaymentDto {
  @IsNotEmpty()
  @IsUUID()
  saleId: string;

  @IsOptional()
  @IsString()
  paymentProcessor?: string;

  @IsOptional()
  @IsString()
  externalTransactionId?: string;

  @IsOptional()
  @IsString()
  paymentLinkId?: string;

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

export class UpdateSalePaymentDto extends PartialType(CreateSalePaymentDto) {}

export class SalePaymentResponseDto extends BaseEntity {
  @Expose()
  paymentProcessor: string;

  @Expose()
  externalTransactionId: string;

  @Expose()
  paymentLinkId: string;

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
