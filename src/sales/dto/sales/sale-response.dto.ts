import { Expose, Type, Exclude } from 'class-transformer';
import { BranchResponseDto } from 'src/logistics/dto';
import { SaleStatus } from 'src/sales/entities';
import { BaseEntity } from 'typeorm';
import { CustomerResponseDto } from '../customer.dto';
import { DiscountCodeResponseDto } from '../discount-code.dto';
import { SaleDetailResponseDto } from '../sale-detail.dto';
import { SaleDiscountResponseDto } from '../sale-discounts/sale-discount-response.dto';
import { SalePaymentResponseDto } from '../sale-payment.dto';

export class SaleResponseDto extends BaseEntity {
  @Expose()
  invoiceNumber: string;

  @Expose()
  date: Date;

  @Expose()
  dueDate: Date;

  @Expose()
  status: SaleStatus;

  @Expose()
  subtotal: number;

  @Expose()
  taxAmount: number;

  @Expose()
  discountAmount: number;

  @Expose()
  total: number;

  @Expose()
  paidAmount: number;

  @Expose()
  pendingAmount: number;

  @Expose()
  notes: string;

  @Expose()
  @Type(() => CustomerResponseDto)
  customer: CustomerResponseDto | null;

  @Expose()
  @Type(() => DiscountCodeResponseDto)
  discountCode: DiscountCodeResponseDto | null;

  @Expose()
  @Type(() => BranchResponseDto)
  branch: BranchResponseDto;

  @Expose()
  @Type(() => SaleDetailResponseDto)
  details: SaleDetailResponseDto[];

  @Expose()
  @Type(() => SalePaymentResponseDto)
  payments: SalePaymentResponseDto[];

  @Expose()
  @Type(() => SaleDiscountResponseDto)
  discounts: SaleDiscountResponseDto[];

  @Expose()
  declare createdAt: Date;

  @Expose()
  declare updatedAt: Date;

  @Exclude()
  declare deletedAt: Date | null;
}
