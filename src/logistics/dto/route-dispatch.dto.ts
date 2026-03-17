import { IsArray, IsDateString, IsOptional, IsString, IsUUID, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RouteDispatchItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  sentQuantity: number;
}

export class CreateRouteDispatchDto {
  @IsDateString()
  date: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  originBranchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteDispatchItemDto)
  items: RouteDispatchItemDto[];
}

export class ReceiveRouteDispatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteDispatchItemReceiveDto)
  items: RouteDispatchItemReceiveDto[];
}

export class RouteDispatchItemReceiveDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  receivedQuantity: number;
}

export class LiquidateRouteDispatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteDispatchItemLiquidateDto)
  items: RouteDispatchItemLiquidateDto[];
}

export class RouteDispatchItemLiquidateDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  soldQuantity: number;

  @IsNumber()
  returnedQuantity: number;

  @IsNumber()
  stayedQuantity: number;

  @IsNumber()
  wasteQuantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
