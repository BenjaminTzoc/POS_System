import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { CreateSaleDto } from './sales.dto';
import { CreateSalePaymentDto } from '../sale-payment.dto';
import { OmitType } from '@nestjs/mapped-types';

import { SaleStatus } from '../../entities';

export class QuickSalePaymentDto extends OmitType(CreateSalePaymentDto, ['saleId'] as const) {}

export class QuickSaleDto extends CreateSaleDto {
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuickSalePaymentDto)
  payments: QuickSalePaymentDto[];

  @IsOptional()
  @IsEnum(SaleStatus)
  finalStatus?: SaleStatus;
}
