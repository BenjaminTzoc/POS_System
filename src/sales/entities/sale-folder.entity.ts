import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Branch } from 'src/logistics/entities';
import { SaleFolderItem } from './sale-folder-item.entity';

@Entity('sale_folders')
export class SaleFolder extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  color: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => Branch, { nullable: false, eager: true })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @OneToMany(() => SaleFolderItem, (item) => item.folder, { cascade: true })
  items: SaleFolderItem[];
}
