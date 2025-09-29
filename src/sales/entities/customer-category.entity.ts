import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Customer } from '.';

@Entity('customer_categories')
export class CustomerCategory extends BaseEntity {
  @Column({ length: 100, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'discount_percentage', type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercentage: number;

  @Column({ name: 'min_purchase_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  minPurchaseAmount: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => Customer, (customer) => customer.category)
  customers: Customer[];
}