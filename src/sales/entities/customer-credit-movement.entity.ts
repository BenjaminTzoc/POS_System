import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Customer } from './customer.entity';
import { Sale } from './sale.entity';
import { SalePayment } from './sale-payment.entity';

export enum CustomerCreditMovementType {
  OVERPAYMENT = 'overpayment',
  APPLIED = 'applied',
}

@Entity('customer_credit_movements')
export class CustomerCreditMovement extends BaseEntity {
  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => Sale, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale | null;

  @ManyToOne(() => SalePayment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payment_id' })
  payment: SalePayment | null;

  @Column({ type: 'enum', enum: CustomerCreditMovementType })
  type: CustomerCreditMovementType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;
}
