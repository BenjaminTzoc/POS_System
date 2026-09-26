import { IsNotEmpty, IsOptional, IsUUID, IsEnum, IsDateString, IsArray, ValidateNested, IsNumber, Min, IsString, Matches, ValidateIf, IsBoolean } from 'class-validator';
import { Type, Expose, Transform } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { BaseEntity } from '../../common/entities/base.entity';
import { TripStatus } from '../entities/trip.entity';
import { TripItemStatus, TripItemType } from '../entities/trip-item.entity';
import { TripReturnStatus } from '../entities/trip-return.entity';
import { TripIncidentStatus } from '../entities/trip-incident.entity';
import { BranchResponseDto } from './branch.dto';
import { TruckResponseDto } from './truck.dto';
import { InventoryTransferResponseDto } from './inventory-transfer.dto';

export class CreateTripItemDto {
  @IsNotEmpty({ message: 'El tipo de operación es obligatorio (transfer o sale_order)' })
  @IsEnum(TripItemType)
  type: TripItemType;

  @IsOptional()
  @IsUUID()
  transferId?: string;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  sequence?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTripDto {
  @IsNotEmpty({ message: 'La fecha del viaje es obligatoria' })
  @IsDateString()
  date: string;

  @IsNotEmpty({ message: 'La sucursal/planta de origen es obligatoria' })
  @IsUUID()
  originBranchId: string;

  @IsNotEmpty({ message: 'El camión es obligatorio' })
  @IsUUID()
  truckId: string;

  @IsNotEmpty({ message: 'El piloto es obligatorio' })
  @IsUUID()
  driverId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripItemDto)
  items?: CreateTripItemDto[];
}

export class AddTripItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripItemDto)
  items: CreateTripItemDto[];
}

export class UpdateTripDto extends PartialType(CreateTripDto) {}

export enum DeliveryOutcome {
  FULL = 'full',
  PARTIAL = 'partial',
  REJECTED = 'rejected',
}

export class DeliverSaleItemDetailDto {
  @IsNotEmpty({ message: 'El id del detalle de la orden es obligatorio' })
  @IsUUID()
  saleDetailId: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  deliveredQuantity: number;
}

export class DeliverSaleItemDto {
  @IsNotEmpty({ message: 'El código OTP es obligatorio para confirmar la entrega' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El OTP debe ser de 6 dígitos numéricos' })
  otp: string;

  @IsNotEmpty({ message: 'El resultado de la entrega es obligatorio (full, partial, rejected)' })
  @IsEnum(DeliveryOutcome)
  outcome: DeliveryOutcome;

  @ValidateIf((o) => o.outcome === DeliveryOutcome.PARTIAL || o.outcome === DeliveryOutcome.REJECTED)
  @IsNotEmpty({ message: 'El motivo es obligatorio en entrega parcial o rechazada' })
  @IsString()
  reason?: string;

  @ValidateIf((o) => o.outcome === DeliveryOutcome.PARTIAL)
  @IsNotEmpty({ message: 'Debe especificar las cantidades entregadas en una entrega parcial' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliverSaleItemDetailDto)
  deliveredItems?: DeliverSaleItemDetailDto[];
}

export class CreateTripIncidentDto {
  @IsNotEmpty({ message: 'La descripción de la incidencia es obligatoria' })
  @IsString()
  description: string;

  @IsOptional()
  @ValidateIf((_, value) => !!value)
  @IsUUID()
  tripItemId?: string;
}

export class ReceiveTripReturnItemDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  receivedQuantity: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  registerAsWaste?: boolean;
}

export enum ReturnDiscrepancyReason {
  LOAD_ERROR = 'load_error',
  ROAD_WASTE = 'road_waste',
  UNKNOWN = 'unknown',
}

export class ReceiveTripReturnDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(ReturnDiscrepancyReason)
  discrepancyReason?: ReturnDiscrepancyReason;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveTripReturnItemDto)
  items?: ReceiveTripReturnItemDto[];
}

export class ResolveTripIncidentDto {
  @IsNotEmpty({ message: 'Las notas de resolución son obligatorias' })
  @IsString()
  resolutionNotes: string;
}

class UserSummaryDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  email: string;
}

export class TripReturnItemResponseDto extends BaseEntity {
  @Expose()
  product: any;

  @Expose()
  returnedQuantity: number;

  @Expose()
  receivedQuantity?: number | null;
}

export class TripReturnResponseDto extends BaseEntity {
  @Expose()
  status: TripReturnStatus;

  @Expose()
  reason?: string | null;

  @Expose()
  receptionNotes?: string | null;

  @Expose()
  receivedAt?: Date | null;

  @Expose()
  @Type(() => UserSummaryDto)
  receivedBy?: UserSummaryDto | null;

  @Expose()
  tripItemId?: string | null;

  @Expose()
  sale?: { id: string; invoiceNumber?: string; orderNumber?: string } | null;

  @Expose()
  @Type(() => TripReturnItemResponseDto)
  items: TripReturnItemResponseDto[];
}

export class TripIncidentResponseDto extends BaseEntity {
  @Expose()
  description: string;

  @Expose()
  status: TripIncidentStatus;

  @Expose()
  resolutionNotes?: string | null;

  @Expose()
  resolvedAt?: Date | null;

  @Expose()
  @Type(() => UserSummaryDto)
  resolvedBy?: UserSummaryDto | null;

  @Expose()
  attachmentUrls?: string[] | null;

  @Expose()
  tripItemId?: string | null;
}

export class TripItemResponseDto extends BaseEntity {
  @Expose()
  type: TripItemType;

  @Expose()
  status: TripItemStatus;

  @Expose()
  sequence: number;

  @Expose()
  deliveredAt?: Date | null;

  @Expose()
  notes?: string;

  @Expose()
  @Type(() => InventoryTransferResponseDto)
  transfer?: InventoryTransferResponseDto | null;

  @Expose()
  sale?: any | null;
}

export class TripResponseDto extends BaseEntity {
  @Expose()
  tripNumber: string;

  @Expose()
  date: Date;

  @Expose()
  status: TripStatus;

  @Expose()
  departureAt?: Date | null;

  @Expose()
  completedAt?: Date | null;

  @Expose()
  notes?: string;

  @Expose()
  @Type(() => BranchResponseDto)
  originBranch: BranchResponseDto;

  @Expose()
  @Type(() => TruckResponseDto)
  truck: TruckResponseDto;

  @Expose()
  @Type(() => UserSummaryDto)
  driver: UserSummaryDto;

  @Expose()
  @Type(() => UserSummaryDto)
  createdBy?: UserSummaryDto | null;

  @Expose()
  @Type(() => TripItemResponseDto)
  items: TripItemResponseDto[];

  @Expose()
  @Type(() => TripReturnResponseDto)
  returns?: TripReturnResponseDto[];

  @Expose()
  @Type(() => TripIncidentResponseDto)
  incidents?: TripIncidentResponseDto[];
}
