import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository, EntityManager, DataSource } from 'typeorm';
import { Permission, Role, User } from './entities';
import { CreatePermissionDto, CreateRoleDto, CreateUserDto, PermissionResponseDto, RoleResponseDto, UpdatePermissionDto, UpdateRoleDto, UpdateUserDto, UserResponseDto } from './dto';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Branch } from 'src/logistics/entities';
import { MENU_ITEMS, RECURRENT_MENU } from 'src/auth/constants/menu.constants';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async seedDefaultData(manager?: EntityManager): Promise<{ message: string }> {
    const repo = (entity: any) => manager ? manager.getRepository(entity) : this.dataSource.getRepository(entity);
    // Actually, simple way:
    const permissionRepo = manager ? manager.getRepository(Permission) : this.permissionRepository;
    const roleRepo = manager ? manager.getRepository(Role) : this.roleRepository;
    const userRepo = manager ? manager.getRepository(User) : this.userRepository;
    const branchRepo = manager ? manager.getRepository(Branch) : this.branchRepository;

    // 1. Create Permissions from menu and master list
    const permissionNames = new Set<string>();
    const extractPermissions = (items: any[]) => {
      items.forEach(item => {
        if (item.permission) permissionNames.add(item.permission);
        if (item.children) extractPermissions(item.children);
      });
    };
    
    extractPermissions(MENU_ITEMS);
    extractPermissions(RECURRENT_MENU);
    
    // Master permissions list according to ROLES_Y_SEGURIDAD.md
    const masterPermissions = [
      'auth.manage',
      'admin.view',
      'users.manage',
      'roles.manage',
      'sales.view',
      'orders.view',
      'orders.create',
      'orders.update',
      'orders.cancel',
      'customers.view',
      'customers.create',
      'customers.manage',
      'customer-categories.manage',
      'quotations.view',
      'quotations.create',
      'cash.view',
      'payment-methods.manage',
      'inventory.view',
      'inventory.movements',
      'inventory.transfers',
      'products.view',
      'products.manage',
      'units.manage',
      'product-categories.manage',
      'logistics.view',
      'logistics.trucks',
      'logistics.trips',
      'logistics.settlements',
      'areas.manage',
      'branches.manage',
      'purchases.view',
      'purchases.manage',
      'suppliers.manage',
      'production.orders',
      'production.recipes',
      'production.decomposition',
      'production.manage',
    ];

    masterPermissions.forEach((p) => permissionNames.add(p));

    for (const name of permissionNames) {
      const exists = await permissionRepo.findOne({ where: { name } });
      if (!exists) {
        const [module, ...actionParts] = name.split('.');
        const action = actionParts.join('.') || 'manage';
        
        await permissionRepo.save(permissionRepo.create({ 
          name, 
          description: `Permiso para ${name}`,
          module: module || 'general',
          action: action
        }));
      }
    }

    // 2. Create Roles with their corresponding functional permissions
    const rolesConfig = [
      {
        name: 'ADMIN_GLOBAL',
        description: 'SuperAdmin: Acceso absoluto e irrestricto a todos los módulos, reportes y sucursales',
        isSuperAdmin: true,
        permissionNames: Array.from(permissionNames),
      },
      {
        name: 'CAJERO',
        description: 'Punto de Venta / Mostrador: Venta Rápida, Órdenes de Venta, Cotizaciones, Clientes, Historial de Cajas y Métodos de Pago',
        isSuperAdmin: false,
        permissionNames: [
          'sales.view',
          'orders.view',
          'orders.create',
          'orders.update',
          'customers.view',
          'customers.create',
          'customers.manage',
          'customer-categories.manage',
          'quotations.view',
          'quotations.create',
          'cash.view',
          'payment-methods.manage',
        ],
      },
      {
        name: 'ENCARGADO_INVENTARIO',
        description: 'Bodega y Almacén: Inventarios, Catálogo de Productos, Movimientos de Stock, Traslados entre Sucursales, Compras y Proveedores',
        isSuperAdmin: false,
        permissionNames: [
          'inventory.view',
          'inventory.movements',
          'inventory.transfers',
          'products.view',
          'products.manage',
          'units.manage',
          'product-categories.manage',
          'purchases.view',
          'purchases.manage',
          'suppliers.manage',
        ],
      },
      {
        name: 'LOGISTICA_Y_DESPACHO',
        description: 'Logística y Flotilla: Planificación de Viajes, Vehículos/Camiones, Liquidación Diaria de Rutas y Traslados',
        isSuperAdmin: false,
        permissionNames: [
          'logistics.view',
          'logistics.trucks',
          'logistics.trips',
          'logistics.settlements',
          'orders.view',
          'inventory.transfers',
        ],
      },
      {
        name: 'OPERADOR_PRODUCCION',
        description: 'Planta y Transformación: Órdenes de Manufactura, Despiece (Cortes/Merma), Recetas (BOM) y Áreas de Preparación',
        isSuperAdmin: false,
        permissionNames: [
          'production.orders',
          'production.recipes',
          'production.decomposition',
          'production.manage',
          'areas.manage',
          'inventory.view',
        ],
      },
      {
        name: 'PILOTO_REPARTIDOR',
        description: 'Entregas en Ruta: Vista exclusiva de sus viajes asignados y confirmación de entregas con PIN',
        isSuperAdmin: false,
        permissionNames: [
          'logistics.view',
          'logistics.trips',
        ],
      },
    ];

    const savedRoles: Record<string, Role> = {};
    for (const rCfg of rolesConfig) {
      let role = await roleRepo.findOne({ where: { name: rCfg.name }, relations: ['permissions'] });
      const rolePerms = await permissionRepo.find({
        where: { name: In(rCfg.permissionNames) },
      });

      if (!role) {
        role = await roleRepo.save(
          roleRepo.create({
            name: rCfg.name,
            description: rCfg.description,
            isSuperAdmin: rCfg.isSuperAdmin,
            permissions: rolePerms,
          }),
        );
      } else {
        role.permissions = rolePerms;
        role.isSuperAdmin = rCfg.isSuperAdmin;
        role.description = rCfg.description;
        role = await roleRepo.save(role);
      }
      savedRoles[rCfg.name] = role;
    }

    // 3. Create / Update Example Users for Each Role
    const defaultBranch = await branchRepo.findOne({ where: { deletedAt: IsNull() } });

    const exampleUsers = [
      {
        name: 'Administrador Global',
        email: 'admin@pos.com',
        password: 'admin123',
        roleName: 'ADMIN_GLOBAL',
        branch: defaultBranch || null,
      },
      {
        name: 'Cajero Principal',
        email: 'cajero@pos.com',
        password: 'caja123',
        roleName: 'CAJERO',
        branch: defaultBranch || null,
      },
      {
        name: 'Encargado de Bodega',
        email: 'bodega@pos.com',
        password: 'bodega123',
        roleName: 'ENCARGADO_INVENTARIO',
        branch: defaultBranch || null,
      },
      {
        name: 'Planificador Logística',
        email: 'logistica@pos.com',
        password: 'logistica123',
        roleName: 'LOGISTICA_Y_DESPACHO',
        branch: defaultBranch || null,
      },
      {
        name: 'Operador de Planta',
        email: 'produccion@pos.com',
        password: 'produccion123',
        roleName: 'OPERADOR_PRODUCCION',
        branch: defaultBranch || null,
      },
      {
        name: 'Piloto Repartidor',
        email: 'piloto@pos.com',
        password: 'piloto123',
        roleName: 'PILOTO_REPARTIDOR',
        branch: defaultBranch || null,
      },
    ];

    for (const u of exampleUsers) {
      let user = await userRepo.findOne({ where: { email: u.email }, relations: ['roles'] });
      const role = savedRoles[u.roleName];
      const hashedPassword = await bcrypt.hash(u.password, 10);
      
      if (!user) {
        if (role) {
          await userRepo.save(
            userRepo.create({
              name: u.name,
              email: u.email,
              password: hashedPassword,
              roles: [role],
              branch: u.branch,
              emailVerified: true,
            }),
          );
        }
      } else {
        user.name = u.name;
        user.password = hashedPassword;
        if (role) user.roles = [role];
        if (u.branch) user.branch = u.branch;
        await userRepo.save(user);
      }
    }

    return { message: 'Sistema, roles, permisos y usuarios inicializados con éxito' };
  }

  async getDynamicMenu(user: any): Promise<any> {
    
    const userWithRelations = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['roles', 'permissions', 'roles.permissions'],
    });

    if (!userWithRelations) throw new NotFoundException('Usuario no encontrado');

    const userPermissions = new Set([
      ...userWithRelations.permissions.map(p => p.name),
      ...userWithRelations.roles.flatMap(r => r.permissions.map(p => p.name))
    ]);

    const isSuperAdmin = userWithRelations.roles.some(r => r.isSuperAdmin);

    const filterMenu = (items: any[]) => {
      return items
        .map(item => {
          const newItem = { ...item };
          if (newItem.children) {
            newItem.children = filterMenu(newItem.children);
          }
          
          const hasPermission = !newItem.permission || isSuperAdmin || userPermissions.has(newItem.permission);
          const hasVisibleChildren = newItem.children ? newItem.children.length > 0 : true;

          if (hasPermission && hasVisibleChildren) {
            return newItem;
          }
          return null;
        })
        .filter(item => item !== null);
    };

    return {
      recurrent: filterMenu(RECURRENT_MENU),
      main: filterMenu(MENU_ITEMS),
    };
  }

  async createPermission(dto: CreatePermissionDto): Promise<PermissionResponseDto> {
    const existingPermission = await this.permissionRepository.findOne({
      where: { name: dto.name },
      withDeleted: false,
    });

    if (existingPermission) {
      throw new ConflictException(`El permiso '${dto.name}' ya existe`);
    }

    const permission = this.permissionRepository.create(dto);
    const savedPermission = await this.permissionRepository.save(permission);
    return plainToInstance(PermissionResponseDto, savedPermission);
  }

  async findAllPermissions(): Promise<PermissionResponseDto[]> {
    const permissions = await this.permissionRepository.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return plainToInstance(PermissionResponseDto, permissions);
  }

  async findOnePermission(id: string): Promise<PermissionResponseDto> {
    const permission = await this.permissionRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!permission) {
      throw new NotFoundException(`Permiso con ID ${id} no encontrado`);
    }

    return plainToInstance(PermissionResponseDto, permission);
  }

  async updatePermission(id: string, dto: UpdatePermissionDto): Promise<PermissionResponseDto> {
    const permission = await this.permissionRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!permission) {
      throw new NotFoundException(`Permiso con ID ${id} no encontrado`);
    }

    if (dto.name && dto.name !== permission.name) {
      const existingPermission = await this.permissionRepository.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });

      if (existingPermission) {
        throw new ConflictException(`El permiso '${dto.name}' ya existe`);
      }
    }

    Object.assign(permission, dto);
    const updatedPermission = await this.permissionRepository.save(permission);
    return plainToInstance(PermissionResponseDto, updatedPermission);
  }

  async removePermission(id: string): Promise<{ message: string }> {
    const permission = await this.permissionRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!permission) {
      throw new NotFoundException(`Permiso con ID ${id} no encontrado`);
    }

    await this.permissionRepository.softRemove(permission);
    return { message: 'Permiso eliminado exitosamente' };
  }

  async restorePermission(id: string): Promise<PermissionResponseDto> {
    const permission = await this.permissionRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!permission) {
      throw new NotFoundException(`Permiso con ID ${id} no encontrado`);
    }

    if (!permission.deletedAt) {
      throw new ConflictException(`El permiso con ID ${id} no está eliminado`);
    }

    permission.deletedAt = null;
    const restoredPermission = await this.permissionRepository.save(permission);
    return plainToInstance(PermissionResponseDto, restoredPermission);
  }

  async createRole(dto: CreateRoleDto): Promise<RoleResponseDto> {
    const existingRole = await this.roleRepository.findOne({
      where: { name: dto.name },
      withDeleted: false,
    });

    if (existingRole) {
      throw new ConflictException(`El rol '${dto.name}' ya existe`);
    }

    let permissions: Permission[] = [];

    if (dto.isSuperAdmin) {
      permissions = await this.permissionRepository.find({
        where: { deletedAt: IsNull() },
      });
    } else if (dto.permissionIds && dto.permissionIds.length > 0) {
      permissions = await this.permissionRepository.find({
        where: { id: In(dto.permissionIds), deletedAt: IsNull() },
      });

      if (permissions.length !== dto.permissionIds.length) {
        throw new BadRequestException('Algunos permisos no existen o están eliminados');
      }
    }

    const role = this.roleRepository.create({
      ...dto,
      isSuperAdmin: dto.isSuperAdmin || false,
      permissions,
    });

    const savedRole = await this.roleRepository.save(role);
    return plainToInstance(RoleResponseDto, savedRole);
  }

  async findAllRoles(): Promise<RoleResponseDto[]> {
    const roles = await this.roleRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['permissions'],
      order: { createdAt: 'DESC' },
    });
    return plainToInstance(RoleResponseDto, roles);
  }

  async findOneRole(id: string): Promise<RoleResponseDto> {
    const role = await this.roleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    }

    return plainToInstance(RoleResponseDto, role);
  }

  async updateRole(id: string, dto: UpdateRoleDto): Promise<RoleResponseDto> {
    const role = await this.roleRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException(`El rol con ID ${id} al que intenta modificar no existe`);
    }

    if (dto.name && dto.name !== role.name) {
      const existingRole = await this.roleRepository.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });

      if (existingRole) {
        throw new ConflictException(`El rol '${dto.name}' ya existe`);
      }
    }

    if (dto.permissionIds) {
      const permissions = await this.permissionRepository.find({
        where: { id: In(dto.permissionIds), deletedAt: IsNull() },
      });

      if (permissions.length !== dto.permissionIds.length) {
        throw new BadRequestException('Algunos permisos no existen o están eliminados');
      }

      role.permissions = permissions;
    }

    if (dto.isSuperAdmin !== undefined) {
      role.isSuperAdmin = dto.isSuperAdmin;

      if (dto.isSuperAdmin) {
        const allPermissions = await this.permissionRepository.find({
          where: { deletedAt: IsNull() },
        });
        role.permissions = allPermissions;
      }
    }

    if (dto.permissionIds && !role.isSuperAdmin) {
      const permissions = await this.permissionRepository.find({
        where: { id: In(dto.permissionIds), deletedAt: IsNull() },
      });

      if (permissions.length !== dto.permissionIds.length) {
        throw new BadRequestException('Algunos permisos no existen o están eliminados');
      }
      role.permissions = permissions;
    }

    if (dto.name) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;

    const updatedRole = await this.roleRepository.save(role);
    return plainToInstance(RoleResponseDto, updatedRole);
  }

  async removeRole(id: string): Promise<{ message: string }> {
    const role = await this.roleRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!role) {
      throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    }

    await this.roleRepository.softRemove(role);
    return { message: 'Rol eliminado exitosamente' };
  }

  async restoreRole(id: string): Promise<RoleResponseDto> {
    const role = await this.roleRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    }

    if (!role.deletedAt) {
      throw new ConflictException(`El rol con ID ${id} no está eliminado`);
    }

    role.deletedAt = null;
    const restoredRole = await this.roleRepository.save(role);
    return plainToInstance(RoleResponseDto, restoredRole);
  }

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
      withDeleted: false,
    });

    if (existingUser) {
      throw new ConflictException(`El email '${dto.email}' ya está registrado`);
    }

    const roles = await this.roleRepository.find({
      where: { id: In(dto.roleIds), deletedAt: IsNull() },
      relations: ['permissions'],
    });

    if (roles.length !== dto.roleIds.length) {
      throw new BadRequestException('Algunos roles no existen o están eliminados');
    }

    const isSuperAdmin = roles.some((r) => r.isSuperAdmin);

    let branch: any = null;

    if (!isSuperAdmin) {
      if (!dto.branchId) {
        throw new BadRequestException('La sucursal es obligatoria para este usuario');
      }

      branch = await this.branchRepository.findOne({
        where: { id: dto.branchId, deletedAt: IsNull() },
      });

      if (!branch) {
        throw new BadRequestException('La sucursal no existe');
      }
    }

    let permissions: Permission[] = [];

    if (dto.permissionIds?.length) {
      permissions = await this.permissionRepository.find({
        where: { id: In(dto.permissionIds), deletedAt: IsNull() },
      });
    }

    const rolePermissions = roles.flatMap((r) => r.permissions);
    const mergedPermissions = [...permissions, ...rolePermissions];

    // Hash de la contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    const user = this.userRepository.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      roles,
      permissions: mergedPermissions,
      branch: isSuperAdmin ? null : branch,
      emailVerified: false,
    });

    const savedUser = await this.userRepository.save(user);
    return plainToInstance(UserResponseDto, savedUser);
  }

  async findAllUsers(): Promise<UserResponseDto[]> {
    const users = await this.userRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['roles', 'permissions', 'branch'],
      order: { createdAt: 'DESC' },
    });
    return plainToInstance(UserResponseDto, users);
  }

  async findOneUser(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['roles', 'permissions', 'branch'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return plainToInstance(UserResponseDto, user);
  }

  async findUserByEmail(email: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { email, deletedAt: IsNull() },
      relations: ['roles', 'permissions', 'branch'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);
    }

    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['roles', 'permissions', 'branch'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: dto.email, deletedAt: IsNull() },
      });

      if (existingUser) {
        throw new ConflictException(`El email '${dto.email}' ya está registrado`);
      }
    }

    if (dto.roleIds) {
      const roles = await this.roleRepository.find({
        where: { id: In(dto.roleIds), deletedAt: IsNull() },
        relations: ['permissions'],
      });

      if (roles.length !== dto.roleIds.length) {
        throw new BadRequestException('Algunos roles no existen o están eliminados');
      }

      user.roles = roles;
    }

    const isSuperAdmin = user.roles.some((r) => r.isSuperAdmin);

    if (!isSuperAdmin) {
      if (dto.branchId !== undefined) {
        if (dto.branchId === null) {
          user.branch = null;
        } else {
          const branch = await this.branchRepository.findOne({
            where: { id: dto.branchId, deletedAt: IsNull() },
          });

          if (!branch) {
            throw new BadRequestException('La sucursal no existe');
          }

          user.branch = branch;
        }
      }
    }

    if (isSuperAdmin) {
      user.branch = null;
    }

    let directPermissions = user.permissions;

    if (dto.permissionIds) {
      directPermissions = await this.permissionRepository.find({
        where: { id: In(dto.permissionIds), deletedAt: IsNull() },
      });
    }

    const rolePermissions = user.roles.flatMap((r) => r.permissions);

    user.permissions = [...directPermissions, ...rolePermissions];

    if (dto.name) user.name = dto.name;
    if (dto.email) user.email = dto.email;

    if (dto.password) {
      user.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.emailVerified !== undefined) user.emailVerified = dto.emailVerified;

    const updatedUser = await this.userRepository.save(user);
    return plainToInstance(UserResponseDto, updatedUser);
  }

  async removeUser(id: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    await this.userRepository.softRemove(user);
    return { message: 'Usuario eliminado exitosamente' };
  }

  async restoreUser(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: ['roles', 'permissions', 'branch'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    if (!user.deletedAt) {
      throw new ConflictException(`El usuario con ID ${id} no está eliminado`);
    }

    user.deletedAt = null;
    const restoredUser = await this.userRepository.save(user);
    return plainToInstance(UserResponseDto, restoredUser);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      lastLogin: new Date(),
    });
  }

  async validateUser(email: string, password: string): Promise<{ user?: UserResponseDto; accessToken: string }> {
    const user = await this.findUserByEmail(email);

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.updateLastLogin(user.id);

    const { accessToken } = await this.generateJwt(user);

    return {
      user: plainToInstance(UserResponseDto, user),
      accessToken,
    };
  }

  private async generateJwt(user: User): Promise<{ accessToken: string }> {
    const userWithRelations = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['roles', 'permissions', 'branch'],
    });

    const payload = {
      sub: userWithRelations?.id,
      email: userWithRelations?.email,
      isSuperAdmin: userWithRelations?.roles.some((r) => r.isSuperAdmin),
      branchId: userWithRelations?.branch?.id ?? null,
      roles: userWithRelations?.roles.map((r) => r.name),
      permissions: [...userWithRelations!.permissions.map((p) => p.name), ...userWithRelations!.roles.flatMap((r) => r.permissions.map((p) => p.name))],
    };

    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
  }
}
