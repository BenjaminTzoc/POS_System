import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Purchase } from '.';
import { Product } from 'src/logistics/entities';

@Entity('purchase_details')
export class PurchaseDetail extends BaseEntity {
  @ManyToOne(() => Purchase, (purchase) => purchase.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_id' })
  purchase: Purchase;

  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discount: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ name: 'tax_percentage', type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxPercentage: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 12, scale: 2 })
  lineTotal: number;
}