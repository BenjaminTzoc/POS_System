import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Permission, Role, User } from './entities';
import {
  CreatePermissionDto,
  CreateRoleDto,
  CreateUserDto,
  PermissionResponseDto,
  RoleResponseDto,
  UpdatePermissionDto,
  UpdateRoleDto,
  UpdateUserDto,
  UserResponseDto,
} from './dto';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Permissions CRUD
  async createPermission(
    dto: CreatePermissionDto,
  ): Promise<PermissionResponseDto> {
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

  async updatePermission(
    id: string,
    dto: UpdatePermissionDto,
  ): Promise<PermissionResponseDto> {
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

  //Roles CRUD
  async createRole(dto: CreateRoleDto): Promise<RoleResponseDto> {
    // Verificar si el rol ya existe
    const existingRole = await this.roleRepository.findOne({
      where: { name: dto.name },
      withDeleted: false,
    });

    if (existingRole) {
      throw new ConflictException(`El rol '${dto.name}' ya existe`);
    }

    // Buscar permisos si se proporcionan
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
        throw new BadRequestException(
          'Algunos permisos no existen o están eliminados',
        );
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
      throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    }

    // Verificar si el nuevo nombre ya existe
    if (dto.name && dto.name !== role.name) {
      const existingRole = await this.roleRepository.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });

      if (existingRole) {
        throw new ConflictException(`El rol '${dto.name}' ya existe`);
      }
    }

    // Actualizar permisos si se proporcionan
    if (dto.permissionIds) {
      const permissions = await this.permissionRepository.find({
        where: { id: In(dto.permissionIds), deletedAt: IsNull() },
      });

      if (permissions.length !== dto.permissionIds.length) {
        throw new BadRequestException(
          'Algunos permisos no existen o están eliminados',
        );
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
        throw new BadRequestException(
          'Algunos permisos no existen o están eliminados',
        );
      }
      role.permissions = permissions;
    }

    // Actualizar otros campos
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

  //Users CRUD
  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    // Verificar si el email ya existe
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
      withDeleted: false,
    });

    if (existingUser) {
      throw new ConflictException(`El email '${dto.email}' ya está registrado`);
    }

    // Verificar que el rol existe
    const role = await this.roleRepository.findOne({
      where: { id: dto.roleId, deletedAt: IsNull() },
    });

    if (!role) {
      throw new BadRequestException(`El rol con ID ${dto.roleId} no existe`);
    }

    // Buscar permisos si se proporcionan
    let permissions: Permission[] = [];
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      permissions = await this.permissionRepository.find({
        where: { id: In(dto.permissionIds), deletedAt: IsNull() },
      });

      if (permissions.length !== dto.permissionIds.length) {
        throw new BadRequestException(
          'Algunos permisos no existen o están eliminados',
        );
      }
    }

    // Hash de la contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    const user = this.userRepository.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      role,
      permissions,
      emailVerified: false,
    });

    const savedUser = await this.userRepository.save(user);
    return plainToInstance(UserResponseDto, savedUser);
  }

  async findAllUsers(): Promise<UserResponseDto[]> {
    const users = await this.userRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['role', 'permissions'],
      order: { createdAt: 'DESC' },
    });
    return plainToInstance(UserResponseDto, users);
  }

  async findOneUser(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['role', 'permissions'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return plainToInstance(UserResponseDto, user);
  }

  async findUserByEmail(email: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { email, deletedAt: IsNull() },
      relations: ['role', 'permissions'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);
    }

    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['role', 'permissions'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    // Verificar si el nuevo email ya existe
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: dto.email, deletedAt: IsNull() },
      });

      if (existingUser) {
        throw new ConflictException(
          `El email '${dto.email}' ya está registrado`,
        );
      }
    }

    // Actualizar rol si se proporciona
    if (dto.roleId) {
      const role = await this.roleRepository.findOne({
        where: { id: dto.roleId, deletedAt: IsNull() },
      });

      if (!role) {
        throw new BadRequestException(`El rol con ID ${dto.roleId} no existe`);
      }
      user.role = role;
    }

    // Actualizar permisos si se proporcionan
    if (dto.permissionIds) {
      const permissions = await this.permissionRepository.find({
        where: { id: In(dto.permissionIds), deletedAt: IsNull() },
      });

      if (permissions.length !== dto.permissionIds.length) {
        throw new BadRequestException(
          'Algunos permisos no existen o están eliminados',
        );
      }
      user.permissions = permissions;
    }

    // Actualizar otros campos
    if (dto.name) user.name = dto.name;
    if (dto.email) user.email = dto.email;
    if (dto.password) {
      const saltRounds = 10;
      user.password = await bcrypt.hash(dto.password, saltRounds);
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
      relations: ['role', 'permissions'],
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

  async validateUser(
    email: string,
    password: string,
  ): Promise<{ user: UserResponseDto; accessToken: string }> {
    const user = await this.findUserByEmail(email);

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Actualizar último login
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
      relations: ['role', 'permissions', 'branch'],
    });

    const payload = {
      sub: userWithRelations?.id,
      email: userWithRelations?.email,
      role: userWithRelations?.role.name,
      isSuperAdmin: userWithRelations?.role.isSuperAdmin,
      branchId: userWithRelations?.branch.id,
      permissions: [
        ...userWithRelations!.permissions.map((p) => p.name),
        ...userWithRelations!.role.permissions.map((p) => p.name),
      ],
    };

    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
  }
}
