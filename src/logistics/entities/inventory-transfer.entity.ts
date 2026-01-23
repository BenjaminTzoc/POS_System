import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Branch } from './branch.entity';
import { User } from 'src/auth/entities/user.entity';
import { InventoryTransferItem } from './inventory-transfer-item.entity';

export enum TransferStatus {
  PENDING = 'PENDING',
  SHIPPED = 'SHIPPED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

@Entity('inventory_transfers')
export class InventoryTransfer extends BaseEntity {
  @ManyToOne(() => Branch, { eager: true, nullable: false })
  @JoinColumn({ name: 'origin_branch_id' })
  originBranch: Branch;

  @ManyToOne(() => Branch, { eager: true, nullable: false })
  @JoinColumn({ name: 'destination_branch_id' })
  destinationBranch: Branch;

  @Column({
    type: 'enum',
    enum: TransferStatus,
    default: TransferStatus.PENDING,
  })
  status: TransferStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => InventoryTransferItem, (item) => item.transfer, {
    cascade: true,
  })
  items: InventoryTransferItem[];

  @ManyToOne(() => User, { eager: true, nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'transfer_number', length: 50, unique: true })
  transferNumber: string;
}
