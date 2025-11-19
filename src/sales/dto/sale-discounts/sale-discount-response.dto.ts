import { Expose } from 'class-transformer';
import { SaleDiscountType } from 'src/sales/entities/sale-discount.entity';

export class SaleDiscountResponseDto {
  @Expose()
  type: SaleDiscountType;

  @Expose()
  value: number;

  @Expose()
  reason?: string;
}
