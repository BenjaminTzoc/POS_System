import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Inventory, InventoryMovement } from '.';
import { User } from 'src/auth/entities';

@Entity('branches')
export class Branch extends BaseEntity {
  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ length: 200 })
  address: string;

  @Column({ type: 'text', nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @OneToMany(() => User, (user) => user.branch)
  users: User[];

  @OneToMany(() => Inventory, (inventory) => inventory.branch)
  inventories: Inventory[];

  @OneToMany(() => InventoryMovement, (movement) => movement.branch)
  movements: InventoryMovement[];

  @OneToMany(() => InventoryMovement, (movement) => movement.sourceBranch)
  outgoingTransfers: InventoryMovement[];

  @OneToMany(() => InventoryMovement, (movement) => movement.targetBranch)
  incomingTransfers: InventoryMovement[];
}
