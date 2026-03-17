import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Product } from '../../logistics/entities/product.entity';
import { DecompositionOrder } from './decomposition-order.entity';
import { columnNumericTransformer } from '../../common/utils/transformers';

@Entity('decomposition_items')
export class DecompositionItem extends BaseEntity {
  @ManyToOne(() => DecompositionOrder, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'decomposition_order_id' })
  decompositionOrder: DecompositionOrder;

  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'output_product_id' })
  product: Product;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: columnNumericTransformer,
  })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: columnNumericTransformer,
  })
  unitCost: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: columnNumericTransformer,
  })
  totalCost: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: columnNumericTransformer,
    comment: 'Porcentaje del costo total asignado a este item',
  })
  costPercentage: number;
}
