import { IsString, IsOptional, IsNotEmpty, MaxLength, IsBoolean } from 'class-validator';
import { Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';

export class CreatePaymentMethodDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  requiresBankAccount?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  requiresBankAccount?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PaymentMethodResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  code: string;

  @Expose()
  description: string;

  @Expose()
  requiresBankAccount: boolean;

  @Expose()
  isActive: boolean;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}