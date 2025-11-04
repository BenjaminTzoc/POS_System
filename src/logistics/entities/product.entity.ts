import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Category } from './category.entity';
import { Unit } from './unit.entity';
import { Inventory } from './inventory.entity';
import { InventoryMovement } from './inventory-movement.entity';

export enum StockAvailability {
  IN_STOCK = 'in_stock',
  OUT_OF_STOCK = 'out_of_stock',
  LIMITED = 'limited',
}

@Entity('products')
export class Product extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ unique: true, length: 50 })
  sku: string;

  @Column({ type: 'text', name: 'barcode', nullable: true })
  barcode?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'text', nullable: true })
  imageUrl?: string;

  @ManyToOne(() => Category, { eager: true, nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: Category;

  @ManyToOne(() => Unit, { eager: true, nullable: true })
  @JoinColumn({ name: 'unit_id' })
  unit?: Unit;

  @OneToMany(() => Inventory, (inventory) => inventory.product)
  inventories: Inventory[];

  @OneToMany(() => InventoryMovement, (movement) => movement.product)
  movements: InventoryMovement[];

  @Column({ type: 'boolean', default: true })
  manageStock: boolean;

  @Column({ 
    type: 'enum', 
    enum: StockAvailability, 
    default: StockAvailability.IN_STOCK 
  })
  stockAvailability: StockAvailability;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: true })
  isVisible: boolean;
}