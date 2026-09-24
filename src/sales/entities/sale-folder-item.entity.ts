import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Sale } from './sale.entity';
import { SaleFolder } from './sale-folder.entity';

@Entity('sale_folder_items')
@Unique(['folder', 'sale'])
export class SaleFolderItem extends BaseEntity {
  @ManyToOne(() => SaleFolder, (folder) => folder.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'folder_id' })
  folder: SaleFolder;

  @ManyToOne(() => Sale, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
