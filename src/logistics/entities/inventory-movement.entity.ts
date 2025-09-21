import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Branch, Inventory, Product } from '.';
import { columnNumericTransformer } from 'src/common/utils/transformers';

export enum MovementType {
  IN = 'in',           // Entrada de stock
  OUT = 'out',         // Salida de stock (ventas, mermas)
  TRANSFER_OUT = 'transfer_out', // Transferencia entre sucursales (salida)
  TRANSFER_IN = 'transfer_in',   // Transferencia entre sucursales (entrada)
  ADJUSTMENT = 'adjustment' // Ajuste de inventario
}

export enum MovementStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
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

  @Column({ type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer })
  quantity: number;

  @Column({ type: 'enum', enum: MovementType })
  type: MovementType;

  @Column({ type: 'enum', enum: MovementStatus, default: MovementStatus.PENDING })
  status: MovementStatus;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId?: string; // Para relacionar movimientos (ej: transfer_out con transfer_in)

  @ManyToOne(() => Branch, { eager: true, nullable: true })
  @JoinColumn({ name: 'source_branch_id' })
  sourceBranch?: Branch;

  @ManyToOne(() => Branch, { eager: true, nullable: true })
  @JoinColumn({ name: 'target_branch_id' })
  targetBranch?: Branch;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'movement_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  movementDate: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: columnNumericTransformer })
  unitCost?: number; // Costo unitario al momento del movimiento

  @Column({ name: 'total_cost', type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: columnNumericTransformer })
  totalCost?: number; // Costo total (quantity * unitCost)
}