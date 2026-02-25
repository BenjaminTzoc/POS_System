import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('bank_accounts')
export class BankAccount extends BaseEntity {
  @Column({ length: 100 })
  bankName: string;

  @Column({ name: 'account_number', length: 50, unique: true })
  accountNumber: string;

  @Column({ name: 'account_type', type: 'varchar', length: 50, nullable: true })
  accountType: string | null;

  @Column({ length: 100 })
  holderName: string;

  @Column({ name: 'alias', type: 'varchar', length: 100, nullable: true })
  alias: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance: number;
}
