import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, Min } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { ProductResponseDto } from './product.dto';
import { BranchResponseDto } from './branch.dto';

export class CreateInventoryDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsNotEmpty()
  @IsUUID()
  branchId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxStock?: number;
}

export class UpdateInventoryDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxStock?: number;
}

export class InventoryResponseDto extends BaseEntity {
  @Expose()
  @Type(() => ProductResponseDto)
  product: ProductResponseDto;

  @Expose()
  @Type(() => BranchResponseDto)
  branch: BranchResponseDto;

  @Expose()
  stock: number;

  @Expose()
  minStock: number;

  @Expose()
  maxStock: number;

  @Expose()
  lastMovementDate: Date;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}