import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Quotation } from './quotation.entity';

export enum QuotationAdjustmentType {
  DISCOUNT = 'discount',
  INCREASE = 'increase',
}

export enum QuotationValueType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
}

@Entity('quotation_discounts')
export class QuotationDiscount extends BaseEntity {
  @Column({
    type: 'enum',
    enum: QuotationAdjustmentType,
    default: QuotationAdjustmentType.DISCOUNT,
  })
  adjustmentType: QuotationAdjustmentType;

  @Column({
    type: 'enum',
    enum: QuotationValueType,
    default: QuotationValueType.PERCENTAGE,
  })
  valueType: QuotationValueType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  value: number; // si es percent: 10 = 10%

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'amount_applied', type: 'decimal', precision: 12, scale: 2 })
  amountApplied: number; // monto real aplicado en moneda

  @ManyToOne(() => Quotation, (quotation) => quotation.discounts, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'quotation_id' })
  quotation: Quotation;
}
