import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PurchaseDetail, PurchasePayment, Supplier } from '.';

export enum PurchaseStatus {
  PENDING = 'pending',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  CANCELLED = 'cancelled'
}

@Entity('purchases')
export class Purchase extends BaseEntity {
  @Column({ name: 'invoice_number', length: 50, unique: true })
  invoiceNumber: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ name: 'due_date', type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'enum', enum: PurchaseStatus, default: PurchaseStatus.PENDING })
  status: PurchaseStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ name: 'pending_amount', type: 'decimal', precision: 12, scale: 2 })
  pendingAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => Supplier, { eager: true, nullable: false })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @OneToMany(() => PurchaseDetail, (detail) => detail.purchase, { cascade: true })
  details: PurchaseDetail[];

  @OneToMany(() => PurchasePayment, (payment) => payment.purchase, { cascade: true })
  payments: PurchasePayment[];
}