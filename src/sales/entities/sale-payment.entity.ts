import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Sale } from '.';
import { PaymentMethod } from 'src/purchases/entities';
import { BankAccount } from 'src/finances/entities/bank-account.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('sale_payments')
export class SalePayment extends BaseEntity {
  @ManyToOne(() => Sale, (sale) => sale.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @ManyToOne(() => PaymentMethod, { eager: true, nullable: false })
  @JoinColumn({ name: 'payment_method_id' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  externalTransactionId?: string | null;

  @Column({ type: 'text', nullable: true })
  paymentProcessor?: string | null;

  @Column({ type: 'text', nullable: true })
  paymentLinkId?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ name: 'reference_number', type: 'text', nullable: true })
  referenceNumber: string | null;

  @ManyToOne(() => BankAccount, { nullable: true, eager: true })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount | null;

  @Column({ name: 'manual_bank_account', type: 'text', nullable: true })
  manualBankAccount: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.COMPLETED,
  })
  status: PaymentStatus;

  @Column({ name: 'is_down_payment', type: 'boolean', default: false })
  isDownPayment: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
