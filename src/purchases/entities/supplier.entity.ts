import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Purchase } from '.';

@Entity('suppliers')
export class Supplier extends BaseEntity {
  @Column({ length: 200 })
  name: string;

  @Column({ name: 'nit', length: 20, unique: true })
  nit: string;

  @Column({ name: 'contact_name', type: 'text', nullable: true })
  contactName: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'account_number', type: 'text', nullable: true })
  accountNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => Purchase, (purchase) => purchase.supplier)
  purchases: Purchase[];
}