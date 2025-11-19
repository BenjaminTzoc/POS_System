import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SaleStatus } from 'src/sales/entities';
import { CreateSaleDetailDto, GuestCustomerDto } from '..';
import { CreateSaleDiscountDto } from '../sale-discounts/create-sale-discount.dto';
import { OmitType, PartialType } from '@nestjs/mapped-types';

export class CreateSaleDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  invoiceNumber: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  customerId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GuestCustomerDto)
  guestCustomer?: GuestCustomerDto;

  @IsOptional()
  @IsUUID()
  discountCodeId?: string;

  @IsNotEmpty()
  @IsUUID()
  branchId: string;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleDetailDto)
  details: CreateSaleDetailDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleDiscountDto)
  discounts?: CreateSaleDiscountDto[];
}

export class UpdateSaleDto extends PartialType(
  OmitType(CreateSaleDto, ['details', 'discounts'] as const),
) {}
