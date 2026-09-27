import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { BranchSettlementStatus } from '../entities/branch-settlement.entity';

export class UpsertBranchSettlementItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0)
  keepQty: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBranchSettlementDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertBranchSettlementItemDto)
  items?: UpsertBranchSettlementItemDto[];
}

export class ReceiveSettlementItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0)
  receivedQuantity: number;
}

export class ReceiveBranchSettlementDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveSettlementItemDto)
  items: ReceiveSettlementItemDto[];

  @IsOptional()
  @IsBoolean()
  registerAsWaste?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateBranchSettlementIncidentDto {
  @IsNotEmpty({ message: 'La descripción de la incidencia es obligatoria' })
  @IsString()
  description: string;

  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0.001)
  @Transform(({ value }) => Number(value))
  @Type(() => Number)
  quantity: number;
}

export class ResolveBranchSettlementIncidentDto {
  @IsNotEmpty({ message: 'Las notas de resolución son obligatorias' })
  @IsString()
  resolutionNotes: string;
}

export class UpdateBranchSettlementIncidentDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Transform(({ value }) => Number(value))
  @Type(() => Number)
  quantity?: number;
}

export class SubmitSettlementIncidentDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0.001)
  @Transform(({ value }) => Number(value))
  @Type(() => Number)
  quantity: number;

  @IsNotEmpty()
  @IsString()
  description: string;
}

export class SubmitTodaySettlementDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertBranchSettlementItemDto)
  items: UpsertBranchSettlementItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitSettlementIncidentDto)
  incidents?: SubmitSettlementIncidentDto[];
}

export class CreateBranchSettlementDraftDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  businessDate?: string;
}

export class BranchSettlementIncidentResponseDto {
  id: string;
  productId: string | null;
  productName: string | null;
  quantity: number;
  description: string;
  status: string;
  attachmentUrls: string[];
  resolutionNotes?: string | null;
  resolvedAt?: Date | null;
  resolvedByName?: string | null;
}

export class BranchSettlementItemResponseDto {
  id: string;
  productId: string;
  productName: string;
  sku?: string | null;
  unitAbbreviation?: string | null;
  allowsDecimals?: boolean;
  imageUrl?: string | null;
  systemQty: number;
  countedQty: number;
  keepQty: number;
  returnQty: number;
  wasteQty: number;
  receivedQty?: number | null;
  notes?: string | null;
}

export class CashSessionSummaryDto {
  id: string;
  userName: string;
  openedAt: Date;
  closedAt: Date | null;
  openingBalance: number;
  expectedBalance: number;
  closingBalance: number | null;
  difference: number | null;
  status: string;
}

export class BranchSettlementResponseDto {
  id: string;
  settlementNumber: string;
  branchId: string;
  branchName: string;
  businessDate: string;
  status: BranchSettlementStatus;
  notes: string | null;
  transferId?: string | null;
  transferNumber?: string | null;
  transferStatus?: string | null;
  submittedAt?: Date | null;
  submittedByName?: string | null;
  createdAt: Date;
  items: BranchSettlementItemResponseDto[];
  cashSessions: CashSessionSummaryDto[];
  incidents: BranchSettlementIncidentResponseDto[];
}
