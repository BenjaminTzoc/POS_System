import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Sale } from '.';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount'
}

export enum DiscountScope {
  GLOBAL = 'global',
  CATEGORY = 'category',
  PRODUCT = 'product',
  CUSTOMER = 'customer'
}

@Entity('discount_codes')
export class DiscountCode extends BaseEntity {
  @Column({ length: 50, unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: DiscountType })
  type: DiscountType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: number;

  @Column({ type: 'enum', enum: DiscountScope, default: DiscountScope.GLOBAL })
  scope: DiscountScope;

  @Column({ name: 'min_purchase_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  minPurchaseAmount: number | null;

  @Column({ name: 'max_discount_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  maxDiscountAmount: number | null;

  @Column({ name: 'usage_limit', type: 'int', nullable: true })
  usageLimit: number | null;

  @Column({ name: 'used_count', type: 'int', default: 0 })
  usedCount: number;

  @Column({ name: 'valid_from', type: 'timestamp' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'timestamp' })
  validUntil: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'customer_category_id', type: 'uuid', nullable: true })
  customerCategoryId: string | null;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @OneToMany(() => Sale, (sale) => sale.discountCode)
  sales: Sale[];
}