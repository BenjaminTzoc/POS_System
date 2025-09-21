import { IsString, IsOptional, IsNotEmpty, IsEmail, MaxLength, Matches } from 'class-validator';
import { Exclude, Expose } from 'class-transformer';
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
  @Matches(/^\+?[0-9\s\-\(\)]{10,20}$/, {
    message: 'El formato del teléfono no es válido',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;
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
  @Matches(/^\+?[0-9\s\-\(\)]{10,20}$/, {
    message: 'El formato del teléfono no es válido',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;
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
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}