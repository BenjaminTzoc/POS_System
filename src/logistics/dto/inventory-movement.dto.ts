import { IsString, IsOptional, IsNotEmpty, IsUUID, IsNumber, IsEnum, Min, IsDateString } from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { ProductResponseDto } from './product.dto';
import { BranchResponseDto } from './branch.dto';
import { InventoryResponseDto } from './inventory.dto';
import { UserResponseDto } from 'src/auth/dto/user.dto';
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
  @Type(() => UserResponseDto)
  createdBy: UserResponseDto | null;

  @Expose()
  @Type(() => UserResponseDto)
  completedBy: UserResponseDto | null;

  @Expose()
  @Type(() => UserResponseDto)
  cancelledBy: UserResponseDto | null;

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
