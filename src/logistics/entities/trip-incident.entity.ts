import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Trip } from './trip.entity';
import { TripItem } from './trip-item.entity';
import { User } from 'src/auth/entities/user.entity';

export enum TripIncidentStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}

@Entity('trip_incidents')
export class TripIncident extends BaseEntity {
  @ManyToOne(() => Trip, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @ManyToOne(() => TripItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'trip_item_id' })
  tripItem?: TripItem | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: TripIncidentStatus, default: TripIncidentStatus.OPEN })
  status: TripIncidentStatus;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolvedBy?: User | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt?: Date | null;
}
