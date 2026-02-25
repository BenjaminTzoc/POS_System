import { Entity, Column, ManyToOne, OneToMany, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Customer, Sale } from '.';
import { Branch } from 'src/logistics/entities';
import { QuotationItem } from './quotation-item.entity';
import { User } from 'src/auth/entities/user.entity';

export enum QuotationStatus {
  PENDING = 'PENDING',
  CONVERTED = 'CONVERTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

@Entity('quotations')
export class Quotation extends BaseEntity {
  @Column({ name: 'correlative', length: 50, unique: true })
  correlative: string;

  @Column({ type: 'json', nullable: true })
  guestCustomer?: {
    name: string;
    phone?: string;
    email?: string;
    nit?: string;
    address?: string;
  };

  @Column({ name: 'valid_until', type: 'timestamp' })
  validUntil: Date;

  @Column({
    type: 'enum',
    enum: QuotationStatus,
    default: QuotationStatus.PENDING,
  })
  status: QuotationStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @ManyToOne(() => Customer, { eager: true, nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @ManyToOne(() => Branch, { eager: true, nullable: false })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @ManyToOne(() => User, { eager: true, nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @OneToMany(() => QuotationItem, (item) => item.quotation, { cascade: true })
  items: QuotationItem[];

  @OneToOne(() => Sale, { nullable: true })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale | null;
}
