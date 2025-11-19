import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SaleDiscountType } from 'src/sales/entities/sale-discount.entity';

export class CreateSaleDiscountDto {
  @IsEnum(SaleDiscountType)
  type: SaleDiscountType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateSaleDiscountDto extends PartialType(CreateSaleDiscountDto) {}
