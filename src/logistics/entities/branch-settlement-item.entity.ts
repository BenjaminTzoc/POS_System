import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { BranchSettlement } from './branch-settlement.entity';
import { Product } from './product.entity';
import { columnNumericTransformer } from 'src/common/utils/transformers';

@Entity('branch_settlement_items')
export class BranchSettlementItem extends BaseEntity {
  @ManyToOne(() => BranchSettlement, (settlement) => settlement.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'settlement_id' })
  settlement: BranchSettlement;

  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'system_qty', type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer })
  systemQty: number;

  @Column({ name: 'counted_qty', type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer, default: 0 })
  countedQty: number;

  @Column({ name: 'keep_qty', type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer, default: 0 })
  keepQty: number;

  @Column({ name: 'return_qty', type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer, default: 0 })
  returnQty: number;

  @Column({ name: 'waste_qty', type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer, default: 0 })
  wasteQty: number;

  @Column({ name: 'received_qty', type: 'decimal', precision: 10, scale: 3, transformer: columnNumericTransformer, nullable: true })
  receivedQty?: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
