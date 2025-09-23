import { IsString, IsOptional, IsNotEmpty, MaxLength, Matches, IsEmail } from 'class-validator';
import { Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';

export class CreateSupplierDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  name: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9]+-[0-9Kk]$/, { message: 'El NIT debe tener un formato válido' })
  nit: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-\(\)]{8,20}$/, {
    message: 'El formato del teléfono no es válido',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9]+[0-9Kk]?$/, { message: 'El NIT debe tener un formato válido' })
  nit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-\(\)]{8,20}$/, {
    message: 'El formato del teléfono no es válido',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SupplierResponseDto extends BaseEntity {
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
  accountNumber: string;

  @Expose()
  notes: string;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}