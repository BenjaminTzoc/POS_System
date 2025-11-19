import { BaseEntity } from 'src/common/entities';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Sale } from '.';

export enum SaleDiscountType {
  PERCENT = 'percent',
  AMOUNT = 'amount',
}

@Entity('sale_discounts')
export class SaleDiscount extends BaseEntity {
  @Column({ type: 'enum', enum: ['percent', 'amount'] })
  type: 'percent' | 'amount';

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  value: number; // si es percent: 10 = 10%

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amountApplied: number; // monto real aplicado

  @ManyToOne(() => Sale, (sale) => sale.discounts, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  sale: Sale;
}
