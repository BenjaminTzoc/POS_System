import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { BranchSettlement } from './branch-settlement.entity';
import { BranchSettlementItem } from './branch-settlement-item.entity';
import { Product } from './product.entity';
import { User } from 'src/auth/entities/user.entity';
import { columnNumericTransformer } from 'src/common/utils/transformers';

export enum BranchSettlementIncidentStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}

@Entity('branch_settlement_incidents')
export class BranchSettlementIncident extends BaseEntity {
  @ManyToOne(() => BranchSettlement, (settlement) => settlement.incidents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'settlement_id' })
  settlement: BranchSettlement;

  @ManyToOne(() => BranchSettlementItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'settlement_item_id' })
  settlementItem?: BranchSettlementItem | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product?: Product | null;

  @Column({ type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer, default: 0 })
  quantity: number;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: BranchSettlementIncidentStatus, default: BranchSettlementIncidentStatus.OPEN })
  status: BranchSettlementIncidentStatus;

  @Column({ name: 'attachment_urls', type: 'simple-json', nullable: true })
  attachmentUrls?: string[] | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolvedBy?: User | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt?: Date | null;
}
