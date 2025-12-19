//prettier-ignore
import { IsString, IsOptional, IsNotEmpty, IsEmail, IsBoolean, IsArray, MinLength, MaxLength, IsUUID } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { PermissionResponseDto, RoleResponseDto } from '.';
import { BaseEntity } from 'src/common/entities';
import { BranchResponseDto } from 'src/logistics/dto';
import { PartialType } from '@nestjs/mapped-types';

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

  @IsArray()
  @IsUUID('all', { each: true })
  roleIds: string[];

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
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
  roles: RoleResponseDto[];

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
