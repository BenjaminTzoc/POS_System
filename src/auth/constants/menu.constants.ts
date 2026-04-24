export interface MenuItem {
  label: string;
  icon: string;
  route: string;
  children?: MenuItem[];
  badge?: number;
  badgeSeverity?: 'success' | 'info' | 'warning' | 'danger';
  permission?: string;
  visible?: boolean;
}

export const RECURRENT_MENU: MenuItem[] = [
  {
    label: 'Inicio',
    icon: 'pi pi-home',
    route: '/dashboard',
    permission: '',
  },
  {
    label: 'Productos',
    icon: 'pi pi-shopping-bag',
    route: '/inventory/products',
    permission: 'products.manage',
  },
  {
    label: 'Inventario',
    icon: 'pi pi-box',
    route: '/inventory/inventories',
    permission: 'inventory.view',
  },
  {
    label: 'Clientes',
    icon: 'pi pi-users',
    route: '/sales/customers',
    permission: 'customers.view',
  },
  {
    label: 'Ventas',
    icon: 'pi pi-shopping-cart',
    route: '/sales/orders',
    permission: 'sales.view',
  },
  {
    label: 'Venta Rápida',
    icon: 'pi pi-bolt',
    route: '/sales/quick-sale',
    permission: 'sales.create',
  },
  {
    label: 'Historial de Cajas',
    icon: 'pi pi-history',
    route: '/sales/cash-history',
    permission: 'cash.view',
  },
  {
    label: 'POS Rápido',
    icon: 'pi pi-desktop',
    route: '/sales/pos',
    permission: 'sales.pos',
  },
  {
    label: 'Movimientos de inventario',
    icon: 'pi pi-objects-column',
    route: '/inventory/inventory-movements',
    permission: 'inventory.movements',
  },
  {
    label: 'Traslados de Inventario',
    icon: 'pi pi-sync',
    route: '/inventory/inventory-transfers',
    permission: 'inventory.transfers',
  },
  {
    label: 'Órdenes de Compra',
    icon: 'pi pi-shopping-bag',
    route: '/purchases/orders',
    permission: 'purchases.view',
  },
];

export const MENU_ITEMS: MenuItem[] = [
  {
    label: 'Inicio',
    icon: 'pi pi-home',
    route: '/dashboard',
    permission: '',
  },
  {
    label: 'Inventario',
    icon: 'pi pi-box',
    route: '/inventory',
    permission: 'inventory.view',
    children: [
      {
        label: 'Inventario principal',
        icon: 'pi pi-box',
        route: '/inventory/inventories',
        permission: 'inventory.view',
      },
      {
        label: 'Productos',
        icon: 'pi pi-shopping-bag',
        route: '/inventory/products',
        permission: 'products.view',
      },
      {
        label: 'Traslados',
        icon: 'pi pi-sync',
        route: '/inventory/inventory-transfers',
        permission: 'inventory.transfers',
      },
      {
        label: 'Movimientos',
        icon: 'pi pi-objects-column',
        route: '/inventory/inventory-movements',
        permission: 'inventory.movements',
      }
    ],
  },
  {
    label: 'Ventas',
    icon: 'pi pi-shopping-cart',
    route: '/sales',
    permission: 'sales.view',
    children: [
      {
        label: 'Venta Rápida',
        icon: 'pi pi-bolt',
        route: '/sales/quick-sale',
        permission: 'sales.create',
      },
      {
        label: 'Órdenes de Venta',
        icon: '',
        route: '/sales/orders',
        permission: 'sales.view',
      },
      {
        label: 'Historial de Cajas',
        icon: 'pi pi-history',
        route: '/sales/cash-history',
        permission: 'cash.view',
      },
      {
        label: 'Cotizaciones',
        icon: 'pi pi-file-edit',
        route: '/sales/quotations',
        permission: 'quotations.view',
      },
    ],
  },
  {
    label: 'Producción',
    icon: 'pi pi-microchip-ai',
    route: '/production',
    permission: 'production.view',
    children: [
      {
        label: 'Despiece (Cortes)',
        icon: 'pi pi-percentage',
        route: '/production/decomposition',
        permission: 'production.decomposition',
      },
      { 
        label: 'Manufactura',
        icon: 'pi pi-hammer',
        route: '/production/orders',
        permission: 'production.orders',
      },
      {
        label: 'Recetas',
        icon: 'pi pi-receipt',
        route: '/production/recipes',
        permission: 'production.recipes',
      }
    ]
  },
  {
    label: 'Logística',
    icon: 'pi pi-truck',
    route: '/logistics',
    permission: 'logistics.view',
    children: [
      {
        label: 'Despachos de Ruta',
        icon: 'pi pi-send',
        route: '/logistics/dispatches',
        permission: 'logistics.dispatches',
      },
      {
        label: 'Liquidación Diaria',
        icon: 'pi pi-calculator',
        route: '/logistics/settlements',
        permission: 'logistics.settlements',
      },
      {
        label: 'Devoluciones',
        icon: 'pi pi-backward',
        route: '/logistics/returns',
        permission: 'logistics.returns',
      }
    ]
  },
  {
    label: 'Compras',
    icon: 'pi pi-shopping-bag',
    route: '/purchases',
    permission: 'purchases.view',
    children: [
      {
        label: 'Ordenes de compra',
        icon: 'pi pi-shopping-cart',
        route: '/purchases/orders',
        permission: 'purchases.view',
      },
    ],
  },
  {
    label: 'Catálogos',
    icon: 'pi pi-list',
    route: '/catalogs',
    permission: '',
    children: [
      {
        label: 'Sucursales',
        icon: 'pi pi-map-marker',
        route: '/inventory/branches',
        permission: 'branches.manage',
      },
      {
        label: 'Unidades de medida',
        icon: 'pi pi-gauge',
        route: '/inventory/units',
        permission: 'units.manage',
      },
      {
        label: 'Categorías de Productos',
        icon: 'pi pi-tags',
        route: '/inventory/product-categories',
        permission: 'product-categories.manage',
      },
      {
        label: 'Categorías de Clientes',
        icon: 'pi pi-id-card',
        route: '/sales/customer-categories',
        permission: 'customer-categories.manage',
      },
      {
        label: 'Proveedores',
        icon: 'pi pi-truck',
        route: '/purchases/suppliers',
        permission: 'suppliers.manage',
      },
      {
        label: 'Áreas de Preparación',
        icon: 'pi pi-map',
        route: '/logistics/areas',
        permission: 'areas.manage',
      },
      {
        label: 'Clientes',
        icon: 'pi pi-users',
        route: '/sales/customers',
        permission: 'customers.manage',
      },
      {
        label: 'Métodos de Pago',
        icon: 'pi pi-wallet',
        route: '/sales/payment-methods',
        permission: 'payment-methods.manage',
      }
    ]
  }
];
