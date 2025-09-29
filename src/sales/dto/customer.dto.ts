import { IsString, IsOptional, IsNotEmpty, IsUUID, IsEmail, IsNumber, Min, IsDateString, Matches } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { CustomerCategoryResponseDto } from '.';

export class CreateCustomerDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[0-9]+-[0-9Kk]?$/, { message: 'El NIT debe tener un formato válido' })
  nit: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-\(\)]{8,20}$/, {
    message: 'El formato del teléfono no es válido',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPoints?: number;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+-[0-9Kk]?$/, { message: 'El NIT debe tener un formato válido' })
  nit?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-\(\)]{8,20}$/, {
    message: 'El formato del teléfono no es válido',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPoints?: number;
}

export class CustomerResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  nit: string;

  @Expose()
  contactName: string;

  @Expose()
  email: string;

  @Expose()
  phone: string;

  @Expose()
  address: string;

  @Expose()
  birthDate: Date;

  @Expose()
  loyaltyPoints: number;

  @Expose()
  totalPurchases: number;

  @Expose()
  lastPurchaseDate: Date;

  @Expose()
  @Type(() => CustomerCategoryResponseDto)
  category: CustomerCategoryResponseDto | null;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}