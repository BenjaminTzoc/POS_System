import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PaymentMethod, Purchase } from '.';

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

@Entity('purchase_payments')
export class PurchasePayment extends BaseEntity {
  @ManyToOne(() => Purchase, (purchase) => purchase.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_id' })
  purchase: Purchase;

  @ManyToOne(() => PaymentMethod, { eager: true, nullable: false })
  @JoinColumn({ name: 'payment_method_id' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ name: 'reference_number', type: 'text', nullable: true })
  referenceNumber: string | null;

  @Column({ name: 'bank_account', type: 'text', nullable: true })
  bankAccount: string | null;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}