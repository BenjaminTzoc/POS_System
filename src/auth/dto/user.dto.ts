import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsEmail,
  IsBoolean,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { PermissionResponseDto, RoleResponseDto } from '.';
import { BaseEntity } from 'src/common/entities';
import { BranchResponseDto } from 'src/logistics/dto';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(150)
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  @IsString()
  roleId: string;

  @IsNotEmpty()
  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}

export class UserResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  lastLogin: Date | null;

  @Expose()
  emailVerified: boolean;

  @Expose()
  @Type(() => RoleResponseDto)
  role: RoleResponseDto;

  @Expose()
  @Type(() => BranchResponseDto) // 🔥 Nuevo campo
  branch: BranchResponseDto;

  @Expose()
  @Type(() => PermissionResponseDto)
  permissions: PermissionResponseDto[];

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;

  @Exclude()
  password: string;
}
