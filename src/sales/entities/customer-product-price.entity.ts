import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Customer } from './customer.entity';
import { Product } from 'src/logistics/entities';
import { columnNumericTransformer } from 'src/common/utils/transformers';

@Entity('customer_product_prices')
@Unique(['customer', 'product'])
export class CustomerProductPrice extends BaseEntity {
  @ManyToOne(() => Customer, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => Product, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: columnNumericTransformer })
  price: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'valid_from', type: 'timestamp', nullable: true })
  validFrom: Date | null;

  @Column({ name: 'valid_until', type: 'timestamp', nullable: true })
  validUntil: Date | null;
}
