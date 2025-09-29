import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { CustomerCategory, Sale } from '.';

@Entity('customers')
export class Customer extends BaseEntity {
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

  @Column({ name: 'birth_date', type: 'timestamp', nullable: true })
  birthDate: Date | null;

  @Column({ name: 'loyalty_points', type: 'int', default: 0 })
  loyaltyPoints: number;

  @Column({ name: 'total_purchases', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPurchases: number;

  @Column({ name: 'last_purchase_date', type: 'timestamp', nullable: true })
  lastPurchaseDate: Date | null;

  @ManyToOne(() => CustomerCategory, { eager: true, nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: CustomerCategory | null;

  @OneToMany(() => Sale, (sale) => sale.customer)
  sales: Sale[];
}