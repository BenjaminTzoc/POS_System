import { IsString, IsOptional, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { UnitResponseDto } from './unit.dto';

export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  defaultUnitId?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  defaultUnitId?: string;
}

export class CategoryResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  description: string;

  @Expose()
  @Type(() => UnitResponseDto)
  defaultUnit: UnitResponseDto | null;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}