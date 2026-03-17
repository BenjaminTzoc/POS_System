import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Product } from '../../logistics/entities/product.entity';
import { columnNumericTransformer } from '../../common/utils/transformers';

@Entity('product_recipes')
export class ProductRecipe extends BaseEntity {
  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'component_id' })
  component: Product;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: columnNumericTransformer,
  })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
