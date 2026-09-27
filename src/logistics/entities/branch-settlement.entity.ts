import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Branch } from './branch.entity';
import { User } from 'src/auth/entities/user.entity';
import { InventoryTransfer } from './inventory-transfer.entity';
import { BranchSettlementItem } from './branch-settlement-item.entity';
import { BranchSettlementIncident } from './branch-settlement-incident.entity';

export enum BranchSettlementStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  RECEIVED = 'received',
  DISCREPANCY = 'discrepancy',
}

@Entity('branch_settlements')
@Unique(['branch', 'businessDate'])
export class BranchSettlement extends BaseEntity {
  @Column({ name: 'settlement_number', length: 40, unique: true })
  settlementNumber: string;

  @ManyToOne(() => Branch, { nullable: false })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ name: 'business_date', type: 'date' })
  businessDate: string;

  @Column({
    type: 'enum',
    enum: BranchSettlementStatus,
    default: BranchSettlementStatus.DRAFT,
  })
  status: BranchSettlementStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'cash_register_ids', type: 'simple-json', nullable: true })
  cashRegisterIds: string[] | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'submitted_by' })
  submittedBy?: User | null;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt?: Date | null;

  @ManyToOne(() => InventoryTransfer, { nullable: true })
  @JoinColumn({ name: 'transfer_id' })
  transfer?: InventoryTransfer | null;

  @OneToMany(() => BranchSettlementItem, (item) => item.settlement, { cascade: true })
  items: BranchSettlementItem[];

  @OneToMany(() => BranchSettlementIncident, (incident) => incident.settlement, { cascade: true })
  incidents: BranchSettlementIncident[];
}
