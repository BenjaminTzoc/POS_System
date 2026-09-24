import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TripReturn } from './trip-return.entity';
import { Product } from './product.entity';
import { columnNumericTransformer } from 'src/common/utils/transformers';

@Entity('trip_return_items')
export class TripReturnItem extends BaseEntity {
  @ManyToOne(() => TripReturn, (tr) => tr.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_return_id' })
  tripReturn: TripReturn;

  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer })
  returnedQuantity: number;

  @Column({
    name: 'received_quantity',
    type: 'decimal',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: columnNumericTransformer,
  })
  receivedQuantity?: number | null;
}
