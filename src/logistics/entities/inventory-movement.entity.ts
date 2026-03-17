import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Branch, Inventory, Product } from '.';
import { User } from 'src/auth/entities/user.entity';
import { columnNumericTransformer } from 'src/common/utils/transformers';

export enum MovementType {
  IN = 'in', // Entrada de stock
  OUT = 'out', // Salida de stock (ventas, mermas)
  TRANSFER_OUT = 'transfer_out', // Transferencia entre sucursales (salida)
  TRANSFER_IN = 'transfer_in', // Transferencia entre sucursales (entrada)
  ADJUSTMENT = 'adjustment', // Ajuste de inventario
}

export enum MovementStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum MovementConcept {
  SALE = 'sale',
  PURCHASE = 'purchase',
  TRANSFER = 'transfer',
  ADJUSTMENT = 'adjustment',
  WASTE = 'waste',
  RETURN = 'return',
  PRODUCTION = 'production',
  DECOMPOSITION = 'decomposition',
  ROUTE_DISPATCH = 'route_dispatch',
  ROUTE_RETURN = 'route_return',
}

@Entity('inventory_movements')
export class InventoryMovement extends BaseEntity {
  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => Branch, { eager: true, nullable: false })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @ManyToOne(() => Inventory, { nullable: true })
  @JoinColumn({ name: 'inventory_id' })
  inventory?: Inventory;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'completed_by' })
  completedBy?: User;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'cancelled_by' })
  cancelledBy?: User;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: columnNumericTransformer,
  })
  quantity: number;

  @Column({ type: 'enum', enum: MovementType })
  type: MovementType;

  @Column({
    type: 'enum',
    enum: MovementStatus,
    default: MovementStatus.PENDING,
  })
  status: MovementStatus;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId?: string;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  referenceNumber?: string;

  @Column({
    type: 'enum',
    enum: MovementConcept,
    nullable: true,
  })
  concept?: MovementConcept;

  @ManyToOne(() => Branch, { eager: true, nullable: true })
  @JoinColumn({ name: 'source_branch_id' })
  sourceBranch?: Branch;

  @ManyToOne(() => Branch, { eager: true, nullable: true })
  @JoinColumn({ name: 'target_branch_id' })
  targetBranch?: Branch;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({
    name: 'movement_date',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  movementDate: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt?: Date;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason?: string;

  @Column({
    name: 'previous_stock',
    type: 'decimal',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: columnNumericTransformer,
  })
  previousStock?: number;

  @Column({
    name: 'new_stock',
    type: 'decimal',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: columnNumericTransformer,
  })
  newStock?: number;

  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: columnNumericTransformer,
  })
  unitCost?: number;

  @Column({
    name: 'total_cost',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: columnNumericTransformer,
  })
  totalCost?: number;
}
