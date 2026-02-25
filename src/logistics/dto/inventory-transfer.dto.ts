import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested, IsNumber, Min, ArrayNotEmpty } from 'class-validator';
import { Type, Expose } from 'class-transformer';
import { TransferStatus } from '../entities/inventory-transfer.entity';

export class CreateTransferItemDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateInventoryTransferDto {
  @IsNotEmpty()
  @IsUUID()
  originBranchId: string;

  @IsNotEmpty()
  @IsUUID()
  destinationBranchId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNotEmpty()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateTransferItemDto)
  items: CreateTransferItemDto[];
}

export class UpdateTransferStatusDto {
  @IsNotEmpty()
  @IsEnum(TransferStatus)
  status: TransferStatus;
}

export class TransferItemResponseDto {
  @Expose()
  productId: string;

  @Expose()
  productName: string;

  @Expose()
  sku: string;

  @Expose()
  quantity: number;

  @Expose()
  unitAbbreviation?: string;

  @Expose()
  price: number;

  @Expose()
  subtotal: number;

  @Expose()
  imageUrl?: string;
}

export class InventoryTransferResponseDto {
  @Expose()
  id: string;

  @Expose()
  originBranchId: string;

  @Expose()
  originBranchName: string;

  @Expose()
  destinationBranchId: string;

  @Expose()
  destinationBranchName: string;

  @Expose()
  transferNumber: string;

  @Expose()
  status: TransferStatus;

  @Expose()
  notes: string | null;

  @Expose()
  @Type(() => TransferItemResponseDto)
  items: TransferItemResponseDto[];

  @Expose()
  totalValue: number;

  @Expose()
  createdBy: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

export class InventoryTransferListResponseDto {
  @Expose()
  id: string;

  @Expose()
  transferNumber: string;

  @Expose()
  status: TransferStatus;

  @Expose()
  originBranchName: string;

  @Expose()
  destinationBranchName: string;

  @Expose()
  createdBy: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
