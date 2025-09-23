import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PurchasePayment } from '.';

@Entity('payment_methods')
export class PaymentMethod extends BaseEntity {
  @Column({ length: 100, unique: true })
  name: string;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'requires_bank_account', default: false })
  requiresBankAccount: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => PurchasePayment, (payment) => payment.paymentMethod)
  payments: PurchasePayment[];
}