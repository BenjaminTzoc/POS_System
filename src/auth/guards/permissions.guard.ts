import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const isSuperAdmin = user.roles?.some((r: any) => r.isSuperAdmin);
    if (isSuperAdmin) {
      return true;
    }

    // Obtener todos los permisos del usuario (de sus roles + permisos directos)
    const rolePermissions =
      user.roles?.flatMap((r: any) => r.permissions?.map((p: any) => p.name)) ||
      [];
    const directPermissions = user.permissions?.map((p: any) => p.name) || [];

    const userPermissions = new Set([...rolePermissions, ...directPermissions]);

    const hasPermission = requiredPermissions.some((permission) =>
      userPermissions.has(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Permisos requeridos: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
