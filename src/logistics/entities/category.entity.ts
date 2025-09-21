import { Entity, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Product, Unit } from '.';

@Entity('categories')
export class Category extends BaseEntity {
  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @ManyToOne(() => Unit, { eager: true, nullable: true })
  @JoinColumn({ name: 'default_unit_id' })
  defaultUnit?: Unit;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}