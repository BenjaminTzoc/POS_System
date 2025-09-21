import { IsString, IsOptional, IsNotEmpty, IsBoolean, MaxLength } from 'class-validator';
import { Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';

export class CreateUnitDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  abbreviation: string;

  @IsOptional()
  @IsBoolean()
  allowsDecimals?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  abbreviation?: string;

  @IsOptional()
  @IsBoolean()
  allowsDecimals?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UnitResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  abbreviation: string;

  @Expose()
  allowsDecimals: boolean;

  @Expose()
  description: string;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}