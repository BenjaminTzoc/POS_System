import { IsString, IsNotEmpty, IsOptional, MaxLength, IsEnum, IsNumber, Min, IsUUID, IsBoolean } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { BaseEntity } from '../../common/entities/base.entity';
import { TruckStatus } from '../entities/truck.entity';

export class CreateTruckDto {
  @IsNotEmpty({ message: 'El nombre del camión/vehículo es obligatorio' })
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNotEmpty({ message: 'La placa del vehículo es obligatoria' })
  @IsString()
  @MaxLength(20)
  licensePlate: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  model?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  capacity?: number;

  @IsOptional()
  @IsEnum(TruckStatus)
  status?: TruckStatus;

  @IsOptional()
  @IsUUID()
  defaultDriverId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTruckDto extends PartialType(CreateTruckDto) {}

class DriverSummaryDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  email: string;
}

export class TruckResponseDto extends BaseEntity {
  @Expose()
  name: string;

  @Expose()
  licensePlate: string;

  @Expose()
  brand?: string;

  @Expose()
  model?: string;

  @Expose()
  year?: number;

  @Expose()
  capacity?: number;

  @Expose()
  status: TruckStatus;

  @Expose()
  @Type(() => DriverSummaryDto)
  defaultDriver?: DriverSummaryDto | null;

  @Expose()
  notes?: string;

  @Expose()
  isActive: boolean;
}
