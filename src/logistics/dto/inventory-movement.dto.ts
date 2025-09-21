import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, IsEnum, Min, IsDateString } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { ProductResponseDto } from './product.dto';
import { BranchResponseDto } from './branch.dto';
import { InventoryResponseDto } from './inventory.dto';
import { MovementType, MovementStatus } from '../entities/inventory-movement.entity';

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
}

export class InventoryMovementResponseDto extends BaseEntity {
  @Expose()
  @Type(() => ProductResponseDto)
  product: ProductResponseDto;

  @Expose()
  @Type(() => BranchResponseDto)
  branch: BranchResponseDto;

  @Expose()
  @Type(() => InventoryResponseDto)
  inventory: InventoryResponseDto | null;

  @Expose()
  quantity: number;

  @Expose()
  type: MovementType;

  @Expose()
  status: MovementStatus;

  @Expose()
  referenceId: string;

  @Expose()
  @Type(() => BranchResponseDto)
  sourceBranch: BranchResponseDto | null;

  @Expose()
  @Type(() => BranchResponseDto)
  targetBranch: BranchResponseDto | null;

  @Expose()
  notes: string;

  @Expose()
  movementDate: Date;

  @Expose()
  completedAt: Date;

  @Expose()
  unitCost: number;

  @Expose()
  totalCost: number;

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}