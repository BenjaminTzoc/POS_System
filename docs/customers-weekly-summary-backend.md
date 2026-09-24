# Consolidado semanal por cliente — contrato backend

Endpoint para el widget del dashboard **Clientes de la semana**.

**No reutilizar** `GET /api/v1/reports/customers/weekly-consolidation`. Ese solo trae `id`, `name`, `total` y `days[].total` para la matriz lun–dom.

Cuando el front deje el mock, llama este `GET`.

---

## 1. Endpoint

```http
GET /api/v1/reports/customers/weekly-summary
Authorization: Bearer <jwt>
```

Código: `src/reports/controllers/reports.controller.ts` → `getWeeklyCustomerSummary`.  
Servicio: `src/reports/services/customer-weekly-summary.service.ts`.

### Autenticación y sucursal

Igual que `GET /reports/customers/weekly-consolidation`:

- JWT obligatorio (`JwtAuthGuard`).
- Si el usuario **no** es super admin: se ignora `branchId` del query y se usa `user.branch.id`.
- Si es super admin: `branchId` es opcional. Sin él, se incluyen todas las sucursales.

### Envoltura

Misma que el resto de reportes (`ResponseInterceptor`). En 200 el `message` real es **`Operación exitosa`** (no `"OK"`).

```ts
{
  statusCode: number;
  message: string;
  data: CustomerWeeklySummaryDto;
  timestamp: string; // ISO
  path: string;      // URL del request, puede incluir query
}
```

Los **400 de validación** no pasan por esa envoltura: Nest responde `{ statusCode, message, error }`.

### Query params

| Param | Tipo | Obligatorio | Default | Notas |
|---|---|---|---|---|
| `weekStartDate` | `YYYY-MM-DD` | sí | — | Cualquier fecha de la semana. El backend **normaliza a lunes** (semana lun–dom, zona `America/Guatemala`). |
| `branchId` | uuid | no | sucursal del usuario / todas si super admin | Solo aplica para super admin. |
| `limit` | number 1–500 | no | `50` | Máximo de filas de clientes, ordenadas por `total` desc. |

No hay paginación. Si hay más clientes, se recortan a `limit`. Los **KPIs se calculan sobre todo el universo de la semana**, no sobre las filas recortadas.

Ejemplos:

```http
GET /api/v1/reports/customers/weekly-summary?weekStartDate=2026-09-23
GET /api/v1/reports/customers/weekly-summary?weekStartDate=2026-09-23&limit=50
GET /api/v1/reports/customers/weekly-summary?weekStartDate=2026-09-23&branchId=<uuid>
```

---

## 2. Semana y qué ventas entran

- Periodo: **lunes 00:00 → domingo 23:59:59** (`America/Guatemala`).
- Campo de fecha: `sale.date` (cuándo se tomó el pedido), **no** `promisedDeliveryDate`.
- **Incluir** cualquier status salvo `cancelled`.
- **Excluir** `cancelled` y ventas con `deletedAt`.

### Normalización de `weekStartDate`

Se toma el **lunes de la semana que contiene** la fecha (lun–dom).

| Query | Periodo `data.period` |
|---|---|
| `2026-09-23` (miércoles) | `2026-09-21` → `2026-09-27` |
| `2026-09-21` (lunes) | `2026-09-21` → `2026-09-27` |
| `2026-09-27` (domingo) | `2026-09-21` → `2026-09-27` |

### `total` vs preorden

| Concepto | Qué suma | Dónde va |
|---|---|---|
| Venta de la semana | `sale.total` de órdenes **no** canceladas **y** (`isPreorder !== true` **o** la preorden ya no está `pending`) | `customer.total` |
| Preorden pendiente | `sale.total` de `isPreorder === true` **y** `status === pending` creadas en la semana | `customer.preorderCommitted` — **no** entra en `total` |

Una fila puede tener `total: 0` y `preorderCommitted > 0` (solo preórdenes pending). Esa fila **no** cuenta en `kpis.activeCustomerCount` ni puede ser `topCustomer`.

El widget debe mostrar preorden como “comprometido, no es venta confirmada”.

### Consumidor final (C/F)

Todas las ventas **sin** `customerId` (mostrador / invitado) se agrupan en **una sola fila**, aunque el `guestCustomer.name` difiera:

| Campo | Valor |
|---|---|
| `id` | `null` |
| `name` | `"Consumidor final"` |
| `isGuest` | `true` |
| `category` | `{ id: null, name: "Consumidor final" }` |
| `creditLimit` / `creditUsed` | `0` |

Clientes registrados: `isGuest: false`. El front filtra audiencia con `isGuest`; el API **no** tiene filtro `audience`.

---

## 3. Payload `data`

Montos: **number** (no string). Moneda GTQ. El backend redondea a 2 decimales; el front formatea.

Enteros: `trendPercent`, `share`, `top5Concentration`.

```ts
interface CustomerWeeklySummaryDto {
  period: {
    start: string; // lunes YYYY-MM-DD
    end: string;   // domingo YYYY-MM-DD
  };
  kpis: CustomerWeeklyKpisDto;
  customers: CustomerWeeklyItemDto[];
}

interface CustomerWeeklyKpisDto {
  topCustomer: { id: string | null; name: string; total: number } | null;
  averageTicket: number;
  top5Concentration: number; // 0–100, % del gasto de la semana
  pendingAmount: number;     // universo de la semana, no solo limit
  activeCustomerCount: number; // filas con total > 0 (incluye C/F si aplica)
}

interface CustomerWeeklyItemDto {
  id: string | null;
  name: string;
  isGuest: boolean;
  category: {
    id: string | null;
    name: string; // ej. "Mayorista", "Restaurante"
  };
  total: number;
  orderCount: number;
  averageTicket: number;
  trendPercent: number;
  paidAmount: number;
  pendingAmount: number;
  creditLimit: number;
  creditUsed: number;
  lastPurchaseDate: string | null; // YYYY-MM-DD
  inactiveThisWeek: boolean;
  preorderCommitted: number;
  topProduct: {
    productId: string | null;
    name: string;
    quantity: number;
    unit: string; // abreviación, ej. "lb", "un"
  } | null;
  mix: CustomerWeeklyMixItemDto[];
  days: CustomerWeeklyDayDto[]; // siempre 7, lun → dom
}

interface CustomerWeeklyMixItemDto {
  productId: string | null;
  productName: string;
  quantity: number;
  unit: string;
  revenue: number;
  share: number; // 0–100, respecto a customer.total
}

interface CustomerWeeklyDayDto {
  date: string;      // YYYY-MM-DD
  day: 'Lun' | 'Mar' | 'Mié' | 'Jue' | 'Vie' | 'Sáb' | 'Dom';
  total: number;
  orderCount: number;
}
```

---

## 4. Cómo calcular cada campo

Aplica por cliente (o el bucket C/F) **dentro del periodo**, filtrado por sucursal.

| Campo | Regla |
|---|---|
| `total` | `SUM(sale.total)` de ventas de la semana (ver §2). No incluye preorden pending. |
| `orderCount` | Cantidad de esas mismas órdenes (las que entran en `total`). |
| `averageTicket` | `total / orderCount`; `0` si no hay órdenes. |
| `paidAmount` | `SUM(sale.paidAmount)` de esas órdenes (las de `total`). |
| `pendingAmount` | `SUM(sale.pendingAmount)` de esas órdenes (las de `total`). |
| `preorderCommitted` | `SUM(sale.total)` de preórdenes `pending` de la semana. |
| `trendPercent` | `((totalSemana - totalSemanaAnterior) / totalSemanaAnterior) * 100`. Semana anterior = lun–dom previo, **mismas reglas de `total`**. Si la anterior es `0` y esta `> 0` → `100`. Si ambas `0` → `0`. Entero. |
| `topProduct` | Producto con mayor `SUM(detail.lineTotal)` en las ventas que entran en `total`. `quantity` = suma de cantidades. `unit` = `units.abbreviation`. Sin líneas → `null`. |
| `mix` | Top **5** productos por `revenue` (mismas ventas que `total`) + fila `"Otros"` (`productId: null`) si el resto `> 0`. `share = round(revenue / total * 100)`. Si `total` es 0 → `mix = []`. |
| `days` | Siempre 7 slots. `total` y `orderCount` con las mismas reglas que `customer.total` (preorden pending no suma). Días vacíos: `0`. `sum(days.total)` ≈ `customer.total`. |
| `category` | Categoría actual del maestro. Sin categoría: `"Sin categoría"`. C/F: `"Consumidor final"`. |
| `creditLimit` | `customers.creditLimit`. C/F: `0`. |
| `creditUsed` | `SUM(pendingAmount)` de órdenes **no canceladas** del cliente (todas, no solo la semana). C/F: `0`. |
| `lastPurchaseDate` | `MAX(sale.date)` de no canceladas (puede ser **fuera** de la semana), `YYYY-MM-DD` en `America/Guatemala`. |
| `inactiveThisWeek` | **v1: siempre `false`.** No se listan inactivos de 4 semanas. |

### KPIs (universo, no el recorte `limit`)

| KPI | Regla |
|---|---|
| `topCustomer` | Cliente (o C/F) con mayor `total`. `id` puede ser `null` si gana C/F. `null` el objeto si nadie compró (`total > 0`). |
| `averageTicket` | `SUM(total) / SUM(orderCount)` de filas con `total > 0`. |
| `top5Concentration` | `SUM(total de los 5 mayores) / SUM(total de todos) * 100`, entero. `0` si nadie compró. |
| `pendingAmount` | Suma de `pendingAmount` de **todas** las órdenes no canceladas de la semana (incluye preorden pending). |
| `activeCustomerCount` | Filas con `total > 0`. C/F cuenta como 1. Preorden-only no cuenta. |

---

## 5. Orden de `customers`

1. `total` desc.
2. C/F puede salir en cualquier posición según su gasto.
3. Filas con `total === 0` (p. ej. solo preorden) quedan al final.

---

## 6. Ejemplos JSON

### 6.1 Semana con datos

`GET /api/v1/reports/customers/weekly-summary?weekStartDate=2026-09-23&limit=50`

```json
{
  "statusCode": 200,
  "message": "Operación exitosa",
  "data": {
    "period": {
      "start": "2026-09-21",
      "end": "2026-09-27"
    },
    "kpis": {
      "topCustomer": {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Carnicería El Buen Corte",
        "total": 18450.0
      },
      "averageTicket": 1240.55,
      "top5Concentration": 62,
      "pendingAmount": 9500.0,
      "activeCustomerCount": 8
    },
    "customers": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Carnicería El Buen Corte",
        "isGuest": false,
        "category": {
          "id": "11111111-2222-3333-4444-555555555555",
          "name": "Mayorista"
        },
        "total": 18450.0,
        "orderCount": 6,
        "averageTicket": 3075.0,
        "trendPercent": 18,
        "paidAmount": 15400.0,
        "pendingAmount": 3050.0,
        "creditLimit": 12000.0,
        "creditUsed": 3050.0,
        "lastPurchaseDate": "2026-09-22",
        "inactiveThisWeek": false,
        "preorderCommitted": 0,
        "topProduct": {
          "productId": "99999999-aaaa-bbbb-cccc-ddddeeeeffff",
          "name": "Costilla de cerdo",
          "quantity": 86,
          "unit": "lb"
        },
        "mix": [
          {
            "productId": "99999999-aaaa-bbbb-cccc-ddddeeeeffff",
            "productName": "Costilla de cerdo",
            "quantity": 86,
            "unit": "lb",
            "revenue": 6880.0,
            "share": 37
          },
          {
            "productId": "88888888-aaaa-bbbb-cccc-ddddeeeeffff",
            "productName": "Chorizo",
            "quantity": 40,
            "unit": "lb",
            "revenue": 4200.0,
            "share": 23
          },
          {
            "productId": null,
            "productName": "Otros",
            "quantity": 12.5,
            "unit": "",
            "revenue": 7370.0,
            "share": 40
          }
        ],
        "days": [
          { "date": "2026-09-21", "day": "Lun", "total": 2100.0, "orderCount": 1 },
          { "date": "2026-09-22", "day": "Mar", "total": 0, "orderCount": 0 },
          { "date": "2026-09-23", "day": "Mié", "total": 4200.0, "orderCount": 1 },
          { "date": "2026-09-24", "day": "Jue", "total": 1850.0, "orderCount": 1 },
          { "date": "2026-09-25", "day": "Vie", "total": 5100.0, "orderCount": 2 },
          { "date": "2026-09-26", "day": "Sáb", "total": 5200.0, "orderCount": 1 },
          { "date": "2026-09-27", "day": "Dom", "total": 0, "orderCount": 0 }
        ]
      },
      {
        "id": null,
        "name": "Consumidor final",
        "isGuest": true,
        "category": {
          "id": null,
          "name": "Consumidor final"
        },
        "total": 3200.5,
        "orderCount": 14,
        "averageTicket": 228.61,
        "trendPercent": -12,
        "paidAmount": 3200.5,
        "pendingAmount": 0,
        "creditLimit": 0,
        "creditUsed": 0,
        "lastPurchaseDate": "2026-09-23",
        "inactiveThisWeek": false,
        "preorderCommitted": 0,
        "topProduct": {
          "productId": "77777777-aaaa-bbbb-cccc-ddddeeeeffff",
          "name": "Longaniza",
          "quantity": 22,
          "unit": "lb"
        },
        "mix": [
          {
            "productId": "77777777-aaaa-bbbb-cccc-ddddeeeeffff",
            "productName": "Longaniza",
            "quantity": 22,
            "unit": "lb",
            "revenue": 1540.0,
            "share": 48
          }
        ],
        "days": [
          { "date": "2026-09-21", "day": "Lun", "total": 400.0, "orderCount": 2 },
          { "date": "2026-09-22", "day": "Mar", "total": 250.5, "orderCount": 1 },
          { "date": "2026-09-23", "day": "Mié", "total": 800.0, "orderCount": 4 },
          { "date": "2026-09-24", "day": "Jue", "total": 0, "orderCount": 0 },
          { "date": "2026-09-25", "day": "Vie", "total": 900.0, "orderCount": 3 },
          { "date": "2026-09-26", "day": "Sáb", "total": 850.0, "orderCount": 4 },
          { "date": "2026-09-27", "day": "Dom", "total": 0, "orderCount": 0 }
        ]
      },
      {
        "id": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
        "name": "Restaurante La Cabaña",
        "isGuest": false,
        "category": {
          "id": "22222222-3333-4444-5555-666666666666",
          "name": "Restaurante"
        },
        "total": 0,
        "orderCount": 0,
        "averageTicket": 0,
        "trendPercent": 0,
        "paidAmount": 0,
        "pendingAmount": 0,
        "creditLimit": 8000.0,
        "creditUsed": 1500.0,
        "lastPurchaseDate": "2026-08-10",
        "inactiveThisWeek": false,
        "preorderCommitted": 4500.0,
        "topProduct": null,
        "mix": [],
        "days": [
          { "date": "2026-09-21", "day": "Lun", "total": 0, "orderCount": 0 },
          { "date": "2026-09-22", "day": "Mar", "total": 0, "orderCount": 0 },
          { "date": "2026-09-23", "day": "Mié", "total": 0, "orderCount": 0 },
          { "date": "2026-09-24", "day": "Jue", "total": 0, "orderCount": 0 },
          { "date": "2026-09-25", "day": "Vie", "total": 0, "orderCount": 0 },
          { "date": "2026-09-26", "day": "Sáb", "total": 0, "orderCount": 0 },
          { "date": "2026-09-27", "day": "Dom", "total": 0, "orderCount": 0 }
        ]
      }
    ]
  },
  "timestamp": "2026-09-23T06:52:00.000Z",
  "path": "/api/v1/reports/customers/weekly-summary?weekStartDate=2026-09-23&limit=50"
}
```

Notas del ejemplo:

- C/F: `id` null e `isGuest` true.
- La Cabaña es solo preorden pending: `total` 0, `mix` vacío, `topProduct` null.
- `days` siempre trae los 7 días aunque el total del día sea 0.

### 6.2 Semana sin ventas

```json
{
  "statusCode": 200,
  "message": "Operación exitosa",
  "data": {
    "period": {
      "start": "2026-09-21",
      "end": "2026-09-27"
    },
    "kpis": {
      "topCustomer": null,
      "averageTicket": 0,
      "top5Concentration": 0,
      "pendingAmount": 0,
      "activeCustomerCount": 0
    },
    "customers": []
  },
  "timestamp": "2026-09-23T06:52:00.000Z",
  "path": "/api/v1/reports/customers/weekly-summary?weekStartDate=2026-09-23"
}
```

---

## 7. Errores

| Caso | HTTP | Cuerpo |
|---|---|---|
| `weekStartDate` ausente | 400 | Nest validation |
| `weekStartDate` no es `YYYY-MM-DD` | 400 | Nest validation |
| `branchId` no es UUID | 400 | Nest validation |
| `branchId` inexistente | 400 | `{ message: "branchId inexistente" }` |
| `limit` fuera de 1–500 | 400 | Nest validation |
| Sin JWT | 401 | igual que el resto |
| Semana sin ventas | **200** | ver §6.2 |

### `weekStartDate` ausente

```json
{
  "statusCode": 400,
  "message": ["weekStartDate es obligatorio"],
  "error": "Bad Request"
}
```

### `weekStartDate` inválido (`2026/09/23`)

```json
{
  "statusCode": 400,
  "message": ["weekStartDate debe ser YYYY-MM-DD"],
  "error": "Bad Request"
}
```

### `branchId` inexistente

```json
{
  "statusCode": 400,
  "message": "branchId inexistente",
  "error": "Bad Request"
}
```

---

## 8. Qué implementó v1

- Agregación de ventas de la semana por `customerId` (null → un solo C/F).
- Semana anterior solo para `trendPercent`.
- Mix: query de líneas `productId + customerId`, top 5 + `"Otros"` en memoria.
- Días: `EXTRACT(ISODOW)` + 7 slots fijos.
- `creditUsed` = suma de `pendingAmount` vigente del cliente.
- Inactivos de 4 semanas: **omitidos**. `inactiveThisWeek` siempre `false`.

---

## 9. Fuera de alcance (v1)

- Filtro `audience` en el API (el front filtra con `isGuest`).
- Clientes inactivos de las 4 semanas anteriores.
- Comparativo de 12 meses.
- Detalle de abonos / listado de facturas.
- NIT, teléfono, dirección.
- Paginación.

---

## 10. Checklist front

- Dejar el mock y llamar `GET /api/v1/reports/customers/weekly-summary`.
- Enviar `weekStartDate` en `YYYY-MM-DD` (cualquier día de la semana sirve).
- Usar `data.period.start/end` para el label de la semana, no la fecha que se mandó.
- Formatear montos en GTQ; no parsear strings.
- Tratar `id === null` + `isGuest === true` como C/F.
- Mostrar `preorderCommitted` aparte de `total`.
- Pintar `days` lun→dom; no asumir que faltan días vacíos.
- KPIs vienen listos; no recalcularlos solo con las filas visibles si `limit` recorta.
- 400: leer `message` (string o array de strings).
