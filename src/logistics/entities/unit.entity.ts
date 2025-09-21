import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Category } from './category.entity';
import { Product } from './product.entity';

@Entity('units')
export class Unit extends BaseEntity {
  @Column({ unique: true, length: 50 })
  name: string;

  @Column({ length: 10 })
  abbreviation: string;

  @Column({ name: 'allows_decimals', default: false })
  allowsDecimals: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @OneToMany(() => Category, (category) => category.defaultUnit)
  categories: Category[];

  @OneToMany(() => Product, (product) => product.unit)
  products: Product[];
}