import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Product } from './product.entity';
import { RouteDispatch } from './route-dispatch.entity';
import { columnNumericTransformer } from '../../common/utils/transformers';

@Entity('route_dispatch_items')
export class RouteDispatchItem extends BaseEntity {
  @ManyToOne(() => RouteDispatch, (dispatch) => dispatch.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'route_dispatch_id' })
  routeDispatch: RouteDispatch;

  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: columnNumericTransformer,
  })
  sentQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: columnNumericTransformer,
  })
  receivedQuantity?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: columnNumericTransformer,
  })
  soldQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: columnNumericTransformer,
  })
  returnedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: columnNumericTransformer,
  })
  stayedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: columnNumericTransformer,
  })
  wasteQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: columnNumericTransformer,
  })
  discrepancy: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
