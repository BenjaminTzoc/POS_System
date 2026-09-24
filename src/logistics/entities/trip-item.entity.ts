import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Trip } from './trip.entity';
import { InventoryTransfer } from './inventory-transfer.entity';
import { Sale } from 'src/sales/entities/sale.entity';

export enum TripItemType {
  TRANSFER = 'transfer',
  SALE_ORDER = 'sale_order',
}

export enum TripItemStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  PARTIALLY_DELIVERED = 'partially_delivered',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

@Entity('trip_items')
export class TripItem extends BaseEntity {
  @ManyToOne(() => Trip, (trip) => trip.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({
    type: 'enum',
    enum: TripItemType,
  })
  type: TripItemType;

  @ManyToOne(() => InventoryTransfer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transfer_id' })
  transfer?: InventoryTransfer | null;

  @ManyToOne(() => Sale, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sale_id' })
  sale?: Sale | null;

  @Column({
    type: 'enum',
    enum: TripItemStatus,
    default: TripItemStatus.PENDING,
  })
  status: TripItemStatus;

  @Column({ type: 'int', default: 1 })
  sequence: number;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
