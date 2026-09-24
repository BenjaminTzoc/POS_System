import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Branch } from './branch.entity';
import { Truck } from './truck.entity';
import { User } from 'src/auth/entities/user.entity';
import { TripItem } from './trip-item.entity';

import { TripReturn } from './trip-return.entity';
import { TripIncident } from './trip-incident.entity';

export enum TripStatus {
  DRAFT = 'draft',
  ON_ROUTE = 'on_route',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('trips')
export class Trip extends BaseEntity {
  @Column({ name: 'trip_number', length: 50, unique: true })
  tripNumber: string;

  @Column({ type: 'date' })
  date: Date;

  @ManyToOne(() => Branch, { eager: true, nullable: false })
  @JoinColumn({ name: 'origin_branch_id' })
  originBranch: Branch;

  @ManyToOne(() => Truck, { eager: true, nullable: false })
  @JoinColumn({ name: 'truck_id' })
  truck: Truck;

  @ManyToOne(() => User, { eager: true, nullable: false })
  @JoinColumn({ name: 'driver_id' })
  driver: User;

  @Column({
    type: 'enum',
    enum: TripStatus,
    default: TripStatus.DRAFT,
  })
  status: TripStatus;

  @Column({ name: 'departure_at', type: 'timestamp', nullable: true })
  departureAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @OneToMany(() => TripItem, (item) => item.trip, { cascade: true, eager: true })
  items: TripItem[];

  @OneToMany(() => TripReturn, (tripReturn) => tripReturn.trip)
  returns: TripReturn[];

  @OneToMany(() => TripIncident, (incident) => incident.trip)
  incidents: TripIncident[];
}
