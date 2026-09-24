import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, IsEnum, Min, IsDateString } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { MovementType, MovementStatus, MovementConcept } from '../entities/inventory-movement.entity';

export class CreateInventoryMovementDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsNotEmpty()
  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsUUID()
  inventoryId?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNotEmpty()
  @IsEnum(MovementType)
  type: MovementType;

  @IsOptional()
  @IsEnum(MovementStatus)
  status?: MovementStatus;

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsEnum(MovementConcept)
  concept?: MovementConcept;

  @IsOptional()
  @IsUUID()
  sourceBranchId?: string;

  @IsOptional()
  @IsUUID()
  targetBranchId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  movementDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;
}

export class UpdateInventoryMovementDto {
  @IsOptional()
  @IsEnum(MovementStatus)
  status?: MovementStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  movementDate?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;

  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

export class CancelMovementDto {
  @IsNotEmpty()
  @IsString()
  reason: string;
}

export class QueryInventoryMovementDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @IsOptional()
  @IsEnum(MovementStatus)
  status?: MovementStatus;

  @IsOptional()
  @IsEnum(MovementConcept)
  concept?: MovementConcept;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class InventoryMovementBranchDto {
  @Expose()
  name: string;
}

export class InventoryMovementUserDto {
  @Expose()
  name: string;
}

export class InventoryMovementUnitDto {
  @Expose()
  abbreviation: string;
}

export class InventoryMovementProductDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  sku: string;

  @Expose()
  barcode: string;

  @Expose()
  imageUrl: string | null;

  @Expose()
  @Type(() => InventoryMovementUnitDto)
  unit: InventoryMovementUnitDto | null;
}

export class InventoryMovementResponseDto extends BaseEntity {
  @Expose()
  declare id: string;

  @Expose()
  @Type(() => InventoryMovementProductDto)
  product: InventoryMovementProductDto;

  @Expose()
  @Type(() => InventoryMovementBranchDto)
  branch: InventoryMovementBranchDto;

  @Expose()
  @Type(() => InventoryMovementUserDto)
  createdBy: InventoryMovementUserDto | null;

  @Expose()
  @Type(() => InventoryMovementUserDto)
  completedBy: InventoryMovementUserDto | null;

  @Expose()
  @Type(() => InventoryMovementUserDto)
  cancelledBy: InventoryMovementUserDto | null;

  @Expose()
  quantity: number;

  @Expose()
  type: MovementType;

  @Expose()
  status: MovementStatus;

  @Expose()
  referenceId: string;

  @Expose()
  referenceNumber: string;

  @Expose()
  concept: MovementConcept;

  @Expose()
  notes: string;

  @Expose()
  movementDate: Date;

  @Expose()
  completedAt: Date;

  @Expose()
  cancelledAt: Date;

  @Expose()
  cancellationReason: string;

  @Expose()
  unitCost: number;

  @Expose()
  totalCost: number;

  @Expose()
  previousStock: number;

  @Expose()
  newStock: number;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}

export class PaginatedInventoryMovementResponseDto {
  @Expose()
  @Type(() => InventoryMovementResponseDto)
  items: InventoryMovementResponseDto[];

  @Expose()
  total: number;

  @Expose()
  page: number;

  @Expose()
  limit: number;

  @Expose()
  totalPages: number;
}
