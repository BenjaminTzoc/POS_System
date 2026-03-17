import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Branch } from './branch.entity';
import { User } from '../../auth/entities/user.entity';

export enum RouteDispatchStatus {
  SENT = 'sent',
  RECEIVED = 'received',
  RECONCILED = 'reconciled',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

@Entity('route_dispatches')
export class RouteDispatch extends BaseEntity {
  @Column({ type: 'date' })
  date: Date;

  @ManyToOne(() => Branch, { eager: true, nullable: false })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'responsible_id' })
  responsible: User;

  @ManyToOne(() => Branch, { eager: true, nullable: true })
  @JoinColumn({ name: 'origin_branch_id' })
  originBranch: Branch;

  @Column({
    type: 'enum',
    enum: RouteDispatchStatus,
    default: RouteDispatchStatus.SENT,
  })
  status: RouteDispatchStatus;

  @OneToMany('RouteDispatchItem', 'routeDispatch', { cascade: true })
  items: any[];

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'liquidated_at', type: 'timestamp', nullable: true })
  liquidatedAt?: Date;
}
