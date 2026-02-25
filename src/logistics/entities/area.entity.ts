import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Product } from './product.entity';

@Entity('areas')
export class Area extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @ManyToOne(() => Area, { nullable: true })
  @JoinColumn({ name: 'previous_area_id' })
  previousArea?: Area;

  @OneToMany(() => Product, (product) => product.area)
  products: Product[];
}
