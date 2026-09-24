import { IsOptional, IsNotEmpty, IsUUID, IsNumber, Min, IsArray, ValidateNested, ArrayMinSize, IsBoolean } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
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

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class BulkCreateInventoryItemDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

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

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class BulkCreateInventoryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto en el inventario' })
  @ValidateNested({ each: true })
  @Type(() => BulkCreateInventoryItemDto)
  items: BulkCreateInventoryItemDto[];
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

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class InventoryBranchResponse {
  @Expose()
  id: string;

  @Expose()
  name: string;
}

export class InventoryUnitResponse {
  @Expose()
  abbreviation: string;
}

export class InventoryProductResponse {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  sku: string;

  @Expose()
  barcode: string;

  @Expose()
  price: number;

  @Expose()
  imageUrl: string | null;

  @Expose()
  manageStock: boolean;

  @Expose()
  @Type(() => InventoryUnitResponse)
  unit: InventoryUnitResponse | null;
}

export class InventoryResponseDto {
  @Expose()
  id: string;

  @Expose()
  stock: number;

  @Expose()
  minStock: number;

  @Expose()
  maxStock: number;

  @Expose()
  isAvailable: boolean;

  @Expose()
  lastMovementDate: Date;

  @Expose()
  @Type(() => InventoryBranchResponse)
  branch: InventoryBranchResponse;

  @Expose()
  @Type(() => InventoryProductResponse)
  product: InventoryProductResponse;
}
