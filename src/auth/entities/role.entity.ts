import { Entity, Column, ManyToMany, JoinTable } from 'typeorm';
import { Permission } from './permission.entity';
import { BaseEntity } from 'src/common/entities';

@Entity('roles')
export class Role extends BaseEntity {
  @Column({ unique: true, length: 50 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_super_admin', default: false })
  isSuperAdmin: boolean;

  @ManyToMany(() => Permission, { eager: true })
  @JoinTable({
    name: 'roles_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];
}
