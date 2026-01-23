import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { InventoryTransfer } from './inventory-transfer.entity';
import { Product } from './product.entity';
import { columnNumericTransformer } from 'src/common/utils/transformers';

@Entity('inventory_transfer_items')
export class InventoryTransferItem extends BaseEntity {
  @ManyToOne(() => InventoryTransfer, (transfer) => transfer.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transfer_id' })
  transfer: InventoryTransfer;

  @ManyToOne(() => Product, { eager: true, nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: columnNumericTransformer,
  })
  quantity: number;
}
