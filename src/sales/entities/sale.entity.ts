import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Customer, DiscountCode, SaleDetail, SalePayment } from '.';

export enum SaleStatus {
  // Estados de Proceso
  PENDING = 'pending',  // Pendiente de pago/confirmación
  CONFIRMED = 'confirmed',  // Confirmada y pagada
  PREPARING = 'preparing',  // En preparación/procesamiento

  // Estados de Entrega
  READY_FOR_PICKUP = 'ready_for_pickup', // Lista para recoger en tienda
  OUT_FOR_DELIVERY = 'out_for_delivery',  // En camino al cliente
  DELIVERED = 'delivered',  // Entregada completamente

  // Estados de Problemas
  PARTIALLY_DELIVERED = 'partially_delivered',  // Entregada parcialmente
  CANCELLED = 'cancelled', // Cancelada
  ON_HOLD = 'on_hold'  // En espera (stock, etc.)
}

export enum SaleType {
  RETAIL = 'retail',
  WHOLESALE = 'wholesale'
}

@Entity('sales')
export class Sale extends BaseEntity {
  @Column({ name: 'invoice_number', length: 50, unique: true })
  invoiceNumber: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', nullable: true })
  date: Date;

  @Column({ type: 'enum', enum: SaleType, default: SaleType.RETAIL })
  type: SaleType;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.PENDING })
  status: SaleStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ name: 'category_discount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  categoryDiscount: number;

  @Column({ name: 'code_discount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  codeDiscount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ name: 'pending_amount', type: 'decimal', precision: 12, scale: 2 })
  pendingAmount: number;

  @Column({ name: 'loyalty_points_earned', type: 'int', default: 0 })
  loyaltyPointsEarned: number;

  @Column({ name: 'loyalty_points_redeemed', type: 'int', default: 0 })
  loyaltyPointsRedeemed: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => Customer, { eager: true, nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @ManyToOne(() => DiscountCode, { eager: true, nullable: true })
  @JoinColumn({ name: 'discount_code_id' })
  discountCode: DiscountCode | null;

  @OneToMany(() => SaleDetail, (detail) => detail.sale, { cascade: true })
  details: SaleDetail[];

  @OneToMany(() => SalePayment, (payment) => payment.sale, { cascade: true })
  payments: SalePayment[];
}