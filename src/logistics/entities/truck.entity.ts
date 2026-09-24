import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from 'src/auth/entities/user.entity';

export enum TruckStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  INACTIVE = 'inactive',
}

@Entity('trucks')
export class Truck extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ name: 'license_plate', unique: true, length: 20 })
  licensePlate: string;

  @Column({ length: 50, nullable: true })
  brand?: string;

  @Column({ length: 50, nullable: true })
  model?: string;

  @Column({ type: 'int', nullable: true })
  year?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  capacity?: number;

  @Column({
    type: 'enum',
    enum: TruckStatus,
    default: TruckStatus.ACTIVE,
  })
  status: TruckStatus;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'default_driver_id' })
  defaultDriver?: User | null;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
