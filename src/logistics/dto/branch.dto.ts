import { IsString, IsOptional, IsNotEmpty, IsEmail, MaxLength, Matches } from 'class-validator';
import { Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';

export class CreateBranchDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  address: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9\s\-\+\(\)]{8,20}$/, {
    message: 'El formato del teléfono no es válido (debe tener al menos 8 dígitos)',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  isPlant?: boolean;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9\s\-\+\(\)]{8,20}$/, {
    message: 'El formato del teléfono no es válido (debe tener al menos 8 dígitos)',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  isPlant?: boolean;
}

export class BranchResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  address: string;

  @Expose()
  phone: string;

  @Expose()
  email: string;

  @Expose()
  isPlant: boolean;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Expose()
  declare deletedAt: Date | null;
}
