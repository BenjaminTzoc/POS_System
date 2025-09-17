import { IsString, IsOptional, IsNotEmpty, IsArray, MaxLength, ValidateNested, IsBoolean } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { PermissionResponseDto } from '.';
import { BaseEntity } from 'src/common/entities';

export class CreateRoleDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}

export class RoleResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  description: string | null;

  @Expose()
  isSuperAdmin: boolean;

  @Expose()
  @Type(() => PermissionResponseDto)
  permissions: PermissionResponseDto[];

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}