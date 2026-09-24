import { Entity, Column, ManyToOne, JoinColumn, OneToMany, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Branch, InventoryMovement, Product } from '.';
import { columnNumericTransformer } from 'src/common/utils/transformers';

@Entity('inventories')
@Unique(['product', 'branch'])
export class Inventory extends BaseEntity {
  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => Branch, { eager: true, nullable: false })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer })
  stock: number;

  @Column({ name: 'min_stock', type: 'decimal', precision: 10, scale: 3, default: 0, transformer: columnNumericTransformer })
  minStock: number;

  @Column({ name: 'max_stock', type: 'decimal', precision: 10, scale: 3, nullable: true, transformer: columnNumericTransformer })
  maxStock: number | null;

  @Column({ name: 'reserved_stock', type: 'decimal', precision: 10, scale: 3, default: 0, transformer: columnNumericTransformer })
  reservedStock: number;

  @Column({ name: 'last_movement_date', type: 'timestamp', nullable: true })
  lastMovementDate: Date | null;

  @Column({ name: 'is_available', type: 'boolean', default: true })
  isAvailable: boolean;

  get availableStock(): number {
    return Math.max(0, (this.stock || 0) - (this.reservedStock || 0));
  }

  @OneToMany(() => InventoryMovement, (movement) => movement.inventory)
  movements: InventoryMovement[];
}
