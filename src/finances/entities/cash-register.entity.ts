import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../auth/entities/user.entity';
import { Branch } from '../../logistics/entities/branch.entity';

export enum CashRegisterStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

@Entity('cash_registers')
export class CashRegister extends BaseEntity {
  @ManyToOne(() => User, { eager: true, nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Branch, { eager: true, nullable: false })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({
    name: 'opened_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  openedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'opening_balance', type: 'decimal', precision: 12, scale: 2 })
  openingBalance: number;

  @Column({
    name: 'expected_balance',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  expectedBalance: number;

  @Column({
    name: 'closing_balance',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  closingBalance: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  difference: number | null;

  @Column({
    type: 'enum',
    enum: CashRegisterStatus,
    default: CashRegisterStatus.OPEN,
  })
  status: CashRegisterStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
