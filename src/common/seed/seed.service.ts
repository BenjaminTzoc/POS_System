import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, Role, Permission } from '../../auth/entities';
import { Branch } from '../../logistics/entities';
import { PaymentMethod } from '../../purchases/entities';
import { CustomerCategory } from '../../sales/entities';
import { AuthService } from 'src/auth/auth.service';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly authService: AuthService,
  ) {}

  async resetAndSeed() {
    this.logger.log('Iniciando reseteo de base de datos...');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    // 1. Limpiar todas las tablas (FUERA de la transacción principal)
    // Se hace una por una para que si una falla (porque no existe), no aborte las demás
    const tables = [
      // Logística y Movimientos
      'inventory_movements',
      'inventory_transfer_items',
      'inventory_transfers',
      'route_dispatch_items',
      'route_dispatches',
      'inventories',
      
      // Producción
      'decomposition_items',
      'decomposition_orders',
      'production_orders',
      'product_recipes',
      
      // Ventas
      'sale_details',
      'sale_payments',
      'sale_discounts',
      'sales',
      'quotation_items',
      'quotation_discounts',
      'quotations',
      'discount_codes',
      'customer_categories',
      'customers',
      
      // Compras
      'purchase_details',
      'purchase_payments',
      'purchases',
      'suppliers',
      'payment_methods',
      
      // Estructura Base
      'products',
      'categories',
      'units',
      'areas',
      'users_roles',
      'users_permissions',
      'roles_permissions',
      'users',
      'roles',
      'permissions',
      'branches',
    ];

    for (const table of tables) {
      try {
        await queryRunner.query(`TRUNCATE TABLE "${table}" CASCADE`);
      } catch (e) {
        // Solo logueamos advertencia si la tabla no existe, pero continuamos
        this.logger.warn(`Saltando tabla ${table}: ${e.message}`);
      }
    }

    this.logger.log('Proceso de truncado finalizado. Iniciando inserción de datos base...');

    // 2. Iniciar transacción solo para la inserción de datos nuevos
    await queryRunner.startTransaction();

    try {
      // Crear Permisos Básicos con todos los campos requeridos
      const permissionsList = [
        { name: 'auth.manage', description: 'Administrar usuarios, roles y permisos', module: 'auth', action: 'manage' },
        { name: 'logistics.manage', description: 'Administrar inventarios y despachos', module: 'logistics', action: 'manage' },
        { name: 'sales.manage', description: 'Administrar ventas', module: 'sales', action: 'manage' },
        { name: 'purchases.manage', description: 'Administrar compras', module: 'purchases', action: 'manage' },
        { name: 'production.manage', description: 'Administrar producción', module: 'production', action: 'manage' },
        { name: 'reports.view', description: 'Ver reportes', module: 'reports', action: 'view' },
      ];

      const savedPermissions: Permission[] = [];
      for (const p of permissionsList) {
        const permission = queryRunner.manager.create(Permission, p);
        savedPermissions.push(await queryRunner.manager.save(permission));
      }

      // Crear Rol SuperAdmin
      const superAdminRole = queryRunner.manager.create(Role, {
        name: 'SuperAdmin',
        description: 'Acceso total al sistema',
        isSuperAdmin: true,
        permissions: savedPermissions,
      });
      await queryRunner.manager.save(superAdminRole);

      // Crear Sucursal Inicial (Planta)
      const planta = queryRunner.manager.create(Branch, {
        name: 'Planta Central',
        address: 'Ciudad de Guatemala',
        phone: '12345678',
        isPlant: true,
        isCentral: true,
      });
      await queryRunner.manager.save(planta);

      // Crear Métodos de Pago más comunes
      const paymentMethodsList = [
        { name: 'Efectivo', code: 'cash', description: 'Pago en efectivo', requiresBankAccount: false },
        { name: 'Transferencia Bancaria', code: 'bank_transfer', description: 'Transferencia o depósito bancario', requiresBankAccount: true },
        { name: 'Tarjeta de Crédito/Débito', code: 'card', description: 'Pago con tarjeta', requiresBankAccount: false },
        { name: 'Cheque', code: 'check', description: 'Pago con cheque', requiresBankAccount: true },
      ];

      for (const pm of paymentMethodsList) {
        const paymentMethod = queryRunner.manager.create(PaymentMethod, pm);
        await queryRunner.manager.save(paymentMethod);
      }

      // Crear Usuario Administrador
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const adminUser = queryRunner.manager.create(User, {
        name: 'Administrador',
        email: 'admin@pos.com',
        password: hashedPassword,
        roles: [superAdminRole],
        permissions: savedPermissions,
        emailVerified: true,
      });
      await queryRunner.manager.save(adminUser);

      // Crear Categoría de Cliente por defecto
      const defaultCustomerCategory = queryRunner.manager.create(CustomerCategory, {
        name: 'General',
        description: 'Categoría general por defecto para nuevos clientes',
        discountPercentage: 0,
        minPurchaseAmount: 0,
        defaultCreditLimit: 0,
        isActive: true,
      });
      await queryRunner.manager.save(defaultCustomerCategory);

      // 4. Seeding dinámico de permisos y roles basado en el menú
      await this.authService.seedDefaultData(queryRunner.manager);

      await queryRunner.commitTransaction();
      this.logger.log('Seed completado con éxito.');
      return { message: 'Base de datos reiniciada con éxito', status: 'success' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error durante la inserción de datos:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
