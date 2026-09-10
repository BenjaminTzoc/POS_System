import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('company_settings')
export class CompanySetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_name', default: 'CABEN CARNES Y EMBUTIDOS' })
  companyName: string;

  @Column({ name: 'address', default: 'Calle Ficticia 123, Ciudad' })
  address: string;

  @Column({ name: 'phone', default: '2222-3333' })
  phone: string;

  @Column({ name: 'nit', default: '1234567-8' })
  nit: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;
}
