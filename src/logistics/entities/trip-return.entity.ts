import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Trip } from './trip.entity';
import { TripItem } from './trip-item.entity';
import { Sale } from 'src/sales/entities/sale.entity';
import { User } from 'src/auth/entities/user.entity';
import { TripReturnItem } from './trip-return-item.entity';

export enum TripReturnStatus {
  PENDING_RECEIPT = 'pending_receipt', // En tránsito de vuelta a la planta
  RECEIVED_IN_WAREHOUSE = 'received_in_warehouse', // Confirmado y recibido en planta
  CANCELLED = 'cancelled',
}

@Entity('trip_returns')
export class TripReturn extends BaseEntity {
  @ManyToOne(() => Trip, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @ManyToOne(() => TripItem, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_item_id' })
  tripItem: TripItem;

  @ManyToOne(() => Sale, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ type: 'enum', enum: TripReturnStatus, default: TripReturnStatus.PENDING_RECEIPT })
  status: TripReturnStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @OneToMany(() => TripReturnItem, (item) => item.tripReturn, { cascade: true })
  items: TripReturnItem[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'received_by' })
  receivedBy?: User | null;

  @Column({ name: 'received_at', type: 'timestamp', nullable: true })
  receivedAt?: Date | null;

  @Column({ name: 'reception_notes', type: 'text', nullable: true })
  receptionNotes?: string | null;
}
