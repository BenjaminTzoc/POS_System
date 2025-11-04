import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, Min } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { ProductResponseDto } from './product.dto';
import { BranchResponseDto } from './branch.dto';
import { UnitResponseDto } from '.';

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

class InventoryBranchResponse extends BaseEntity {
  @Expose()
  name: string;

  @Exclude()
  address: string;

  @Exclude()
  phone: string;

  @Exclude()
  email: string;

  @Exclude()
  declare createdAt: Date;

  @Exclude()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}

class InventoryCategoryResponse extends BaseEntity {
  @Expose()
  name: string;

  @Exclude()
  description: string;

  @Exclude()
  @Type(() => UnitResponseDto)
  defaultUnit: UnitResponseDto | null;

  @Exclude()
  declare createdAt: Date;

  @Exclude()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}

class InventoryProductResponse extends BaseEntity {
  @Expose()
  name: string;

  @Exclude()
  description: string;

  @Expose()
  sku: string;

  @Expose()
  barcode: string;

  @Exclude()
  cost: number;

  @Expose()
  price: number;

  @Expose()
  imageUrl: string | null;

  @Expose()
  @Type(() => InventoryCategoryResponse)
  category: InventoryCategoryResponse | null;

  @Expose()
  @Type(() => UnitResponseDto)
  unit: UnitResponseDto | null;

  @Exclude()
  declare createdAt: Date;

  @Exclude()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}

export class InventoryResponseDto extends BaseEntity {
  @Expose()
  @Type(() => InventoryProductResponse)
  product: InventoryProductResponse;

  @Expose()
  @Type(() => InventoryBranchResponse)
  branch: InventoryBranchResponse;

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

  @Exclude()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}