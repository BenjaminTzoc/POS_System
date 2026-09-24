import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, Role, Permission } from '../../auth/entities';
import { Branch, Unit, Category } from '../../logistics/entities';
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
    this.logger.log('Iniciando reseteo de base de datos (conservando catálogo de productos)...');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    // Catálogo: no truncar. products depende de units / categories / areas / parent_id;
    // product_recipes es el BOM.
    const preservedTables = ['products', 'categories', 'units', 'areas', 'product_recipes'];

    const tables = [
      'inventory_movements',
      'inventory_transfer_items',
      'inventory_transfers',
      'route_dispatch_items',
      'route_dispatches',
      'inventories',
      'trip_return_items',
      'trip_returns',
      'trip_incidents',
      'trip_items',
      'trips',
      'trucks',
      'decomposition_items',
      'decomposition_orders',
      'production_orders',
      'sale_folder_items',
      'sale_folders',
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
      'purchase_details',
      'purchase_payments',
      'purchases',
      'suppliers',
      'payment_methods',
      'cash_registers',
      'bank_accounts',
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
        this.logger.warn(`Saltando tabla ${table}: ${e.message}`);
      }
    }

    this.logger.log(`Truncado listo. Conservadas: ${preservedTables.join(', ')}`);
    this.logger.log('Iniciando inserción de datos base...');

    await queryRunner.startTransaction();

    try {
      const catalogCounts = await queryRunner.query(`
        SELECT
          (SELECT COUNT(*)::int FROM products) AS products,
          (SELECT COUNT(*)::int FROM units) AS units,
          (SELECT COUNT(*)::int FROM categories) AS categories,
          (SELECT COUNT(*)::int FROM areas) AS areas,
          (SELECT COUNT(*)::int FROM product_recipes) AS recipes
      `);
      const catalog = catalogCounts[0] || {};
      const keepCatalog =
        Number(catalog.products) > 0 ||
        Number(catalog.units) > 0 ||
        Number(catalog.categories) > 0 ||
        Number(catalog.areas) > 0;

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

      const superAdminRole = queryRunner.manager.create(Role, {
        name: 'SuperAdmin',
        description: 'Acceso total al sistema',
        isSuperAdmin: true,
        permissions: savedPermissions,
      });
      await queryRunner.manager.save(superAdminRole);

      const planta = queryRunner.manager.create(Branch, {
        name: 'Planta Central',
        address: 'Ciudad de Guatemala',
        phone: '12345678',
        isPlant: true,
        isCentral: true,
      });
      await queryRunner.manager.save(planta);

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

      const defaultCustomerCategory = queryRunner.manager.create(CustomerCategory, {
        name: 'General',
        description: 'Categoría general por defecto para nuevos clientes',
        discountPercentage: 0,
        minPurchaseAmount: 0,
        defaultCreditLimit: 0,
        isActive: true,
      });
      await queryRunner.manager.save(defaultCustomerCategory);

      if (!keepCatalog) {
        const unitsData = [
          { name: 'Libra', abbreviation: 'lb', allowsDecimals: true, description: 'Libra (0.453 kg) - unidad principal de venta' },
          { name: 'Kilogramo', abbreviation: 'kg', allowsDecimals: true, description: 'Kilogramo' },
          { name: 'Gramo', abbreviation: 'g', allowsDecimals: true, description: 'Gramo - para especias y aditivos' },
          { name: 'Unidad', abbreviation: 'und', allowsDecimals: false, description: 'Pieza o unidad individual' },
          { name: 'Paquete', abbreviation: 'pqt', allowsDecimals: false, description: 'Paquete o bandeja empacada' },
        ];

        const savedUnits: Record<string, Unit> = {};
        for (const u of unitsData) {
          const unit = queryRunner.manager.create(Unit, u);
          savedUnits[u.abbreviation] = await queryRunner.manager.save(unit);
        }

        const categoriesList = [
          { name: 'Carnes Rojas', description: 'Res, cerdo y similares', defaultUnit: savedUnits['lb'] },
          { name: 'Aves', description: 'Pollo, pavo y otras aves', defaultUnit: savedUnits['lb'] },
          { name: 'Embutidos', description: 'Chorizos, salchichas, mortadela', defaultUnit: savedUnits['lb'] },
          { name: 'Mariscos', description: 'Camarón, pescado y mariscos', defaultUnit: savedUnits['lb'] },
          { name: 'Especias', description: 'Condimentos y adobos', defaultUnit: savedUnits['g'] },
          { name: 'Empacados', description: 'Productos listos en bandeja', defaultUnit: savedUnits['pqt'] },
        ];

        for (const c of categoriesList) {
          const category = queryRunner.manager.create(Category, c);
          await queryRunner.manager.save(category);
        }
      } else {
        this.logger.log(
          `Catálogo conservado: ${catalog.products} productos, ${catalog.units} unidades, ${catalog.categories} categorías, ${catalog.areas} áreas, ${catalog.recipes} recetas.`,
        );
      }

      await this.authService.seedDefaultData(queryRunner.manager);

      await queryRunner.commitTransaction();
      this.logger.log('Seed completado con éxito.');
      return {
        message: keepCatalog
          ? 'Base de datos reiniciada. Catálogo de productos conservado.'
          : 'Base de datos reiniciada con catálogo de unidades/categorías de ejemplo.',
        status: 'success',
        catalogPreserved: keepCatalog,
        catalog,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error durante la inserción de datos:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
