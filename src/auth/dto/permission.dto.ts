import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { Exclude, Expose } from 'class-transformer';
import { BaseEntity } from 'src/common/entities';

export class CreatePermissionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  module: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  action: string;
}

export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;
}

export class PermissionResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  description: string | null;

  @Expose()
  module: string;

  @Expose()
  action: string;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}