import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Product } from '../../logistics/entities/product.entity';
import { Branch } from '../../logistics/entities/branch.entity';
import { User } from '../../auth/entities/user.entity';
import { columnNumericTransformer } from '../../common/utils/transformers';

export enum DecompositionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('decomposition_orders')
export class DecompositionOrder extends BaseEntity {
  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'input_product_id' })
  inputProduct: Product;

  @ManyToOne(() => Branch, { eager: true, nullable: false })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: columnNumericTransformer,
  })
  inputQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: columnNumericTransformer,
  })
  totalCost: number;

  @Column({
    type: 'enum',
    enum: DecompositionStatus,
    default: DecompositionStatus.PENDING,
  })
  status: DecompositionStatus;

  @OneToMany('DecompositionItem', 'decompositionOrder', { cascade: true })
  items: any[];

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: columnNumericTransformer,
    default: 0,
  })
  wasteQuantity: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
