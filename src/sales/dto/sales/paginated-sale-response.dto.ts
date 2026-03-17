import { Expose, Type } from 'class-transformer';
import { SaleResponseDto } from './sale-response.dto';

export class PaginatedSaleResponseDto {
  @Expose()
  @Type(() => SaleResponseDto)
  data: SaleResponseDto[];

  @Expose()
  total: number;

  @Expose()
  page: number;

  @Expose()
  limit: number;
}
