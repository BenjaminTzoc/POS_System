# Pulso de hoy — contrato backend

Endpoint para el widget del dashboard **Pulso de hoy** (columna al lado del consolidado semanal por cliente).

**Estado:** implementado. El front deja el mock y llama este `GET`.

Código: `src/reports/controllers/reports.controller.ts` → `getTodayPulse`.  
Servicio: `src/reports/services/today-pulse.service.ts`.

---

## 0. Un endpoint para todo el dashboard: no

No juntar esto con un “dashboard god endpoint”.

El panel ya pega varios reportes con **ciclos de vida distintos**:

| Widget | Endpoint actual | Por qué no mezclarlo |
|---|---|---|
| Pulso de hoy | **este** | Operativo del día, se refresca seguido |
| Clientes de la semana | `GET /reports/customers/weekly-summary` | Semana lun–dom, selector propio |
| Matriz sucursales | `GET /reports/branches/weekly-consolidation` | Mes, imprimible |
| Drill-down producto/cliente | `…/weekly-consolidation` | Solo al entrar al detalle |
| Órdenes de hoy + gráfico + facturas + stock header | `GET /reports/orders/summary` | Listas y series, payload grande |
| Calendario de cobros | `GET /reports/dashboard/calendar` | Mes, otro click |

Unificarlos:

- Recalcula la semana y el mes cada vez que se refresca el pulso.
- Infla el payload (matriz + calendario + listas).
- Impide cachear / invalidar por widget.
- Ya existe `GET /reports/dashboard` (`UnifiedDashboardDto`) y **el dashboard actual no lo usa**. No revivirlo para esto.

Tampoco **inflar** `GET /reports/orders/summary`. Ese ya alimenta gráfico horario, últimas órdenes, donut de facturas y alertas de stock. El pulso necesita **otro recorte** (desglose de cola, mix efectivo/crédito, deudor top, hora pico, SKUs concretos). Si más adelante el front deja de pintar algún bloque de `orders/summary`, se puede deprecar por separado.

**Decisión:** un endpoint nuevo, chico, solo para las 4 cards.

---

## 1. Endpoint

```http
GET /api/v1/reports/dashboard/today-pulse
Authorization: Bearer <jwt>
```

Misma envoltura que el resto de reportes:

```ts
{
  statusCode: number;
  message: string; // "Operación exitosa"
  data: TodayPulseDto;
  timestamp: string;
  path: string;
}
```

### Autenticación y sucursal

Igual que `GET /reports/customers/weekly-summary`:

- JWT obligatorio.
- Si el usuario **no** es super admin: se ignora `branchId` y se usa `user.branch.id`.
- Si es super admin: `branchId` opcional. Sin él, todas las sucursales visibles.

### Query params

| Param | Tipo | Obligatorio | Default | Notas |
|---|---|---|---|---|
| `branchId` | uuid | no | sucursal del usuario / todas si super admin | Solo aplica para super admin. |
| `lowStockLimit` | number 1–10 | no | `3` | SKUs a listar en Atención. |

Ejemplos:

```http
GET /api/v1/reports/dashboard/today-pulse
GET /api/v1/reports/dashboard/today-pulse?branchId=<uuid>
GET /api/v1/reports/dashboard/today-pulse?lowStockLimit=3
```

---

## 2. “Hoy” y qué ventas entran

- Zona: **`America/Guatemala`**.
- Hoy: **00:00:00 → 23:59:59.999** de la fecha civil actual en esa zona.
- Ayer: el día civil anterior, mismo rango.
- Campo de fecha de venta: `sale.date` (cuándo se tomó el pedido), **no** `promisedDeliveryDate`.
- **Excluir** `cancelled` y ventas con `deletedAt`.

### Venta confirmada vs preorden pendiente

Misma regla que el consolidado semanal:

| Concepto | Qué suma | Dónde va |
|---|---|---|
| Venta de hoy | `sale.total` de órdenes de **hoy**, no canceladas, y (`isPreorder !== true` **o** la preorden ya no está `pending`) | `sales.total` |
| Preorden pendiente | `isPreorder === true` **y** `status === pending` | cola `pending.preorder` / `attention.preordersForToday` — **no** entra en `sales.total` |

C/F (sin `customerId`): el nombre a mostrar es `"Consumidor final"`.

---

## 3. Payload `data`

```ts
interface TodayPulseDto {
  date: string; // YYYY-MM-DD civil en America/Guatemala
  currency: 'GTQ';
  sales: TodayPulseSalesDto;
  pending: TodayPulsePendingDto;
  receivable: TodayPulseReceivableDto;
  attention: TodayPulseAttentionDto;
}

interface TodayPulseSalesDto {
  total: number;            // Q vendido hoy (regla de arriba)
  previousTotal: number;    // Q vendido ayer (misma regla)
  changePercent: number;    // vs ayer; ver fórmula
  ticketCount: number;      // cantidad de ventas de hoy que entran en `total`
  averageTicket: number;    // total / ticketCount, o 0 si ticketCount === 0
  cashToday: number;        // cobrado hoy en efectivo (pagos del día)
  creditToday: number;      // de las ventas de hoy que quedaron a crédito / CxC
  otherToday: number;       // cobrado hoy en otros métodos (tarjeta, transferencia, etc.)
  peakHour: {
    hour: number | null;    // 0–23, hora de Guatemala; null si no hubo ventas
    label: string | null;   // "11:00–12:00"
  };
}

interface TodayPulsePendingDto {
  total: number;            // preparing + delivery + preorder (buckets disjuntos)
  preparing: number;        // por preparar
  delivery: number;         // por entregar / en camino
  preorder: number;         // preorden pending
  oldestMinutes: number | null; // minutos desde sale.date de la más vieja en la cola; null si total === 0
  nextCustomer: {
    saleId: string;
    name: string;           // cliente o "Consumidor final"
  } | null;
}

interface TodayPulseReceivableDto {
  total: number;            // saldo abierto (todas las fechas, no solo hoy)
  overdue: number;          // vencido a la fecha civil de hoy
  dueToday: number;         // vence hoy y aún no está vencido de más
  invoiceCount: number;     // documentos con saldo > 0
  topDebtor: {
    customerId: string | null; // null = C/F agrupado
    name: string;
    amount: number;
  } | null;
}

interface TodayPulseAttentionDto {
  lowStockCount: number;    // total de SKUs bajo mínimo en el alcance (no el recorte)
  preordersForToday: number;
  lowStock: Array<{
    productId: string;
    name: string;
    quantity: number;
    unit: string;           // "lb", "kg", "un", etc.
    branchName?: string;    // útil si el pulso es multi-sucursal
  }>;
}
```

Números en **number** (no strings). Redondeo a 2 decimales en montos. `changePercent` a 1 decimal.

---

## 4. Cómo calcular cada card

### 4.1 Ventas de hoy

- `total` / `previousTotal`: suma de `sale.total` del día, con la regla venta vs preorden.
- `ticketCount`: **número de esas ventas** (no líneas).
- `averageTicket`: `ticketCount === 0 ? 0 : total / ticketCount`.
- `changePercent`:
  - si `previousTotal === 0` y `total === 0` → `0`
  - si `previousTotal === 0` y `total > 0` → `100`
  - si no → `((total - previousTotal) / previousTotal) * 100`
- `cashToday`: suma de **pagos** del día (`payment.date` en hoy, status cobrado / no anulado) cuyo método sea efectivo (`code`/`name` tipo `CASH` / “efectivo”). Es cobrado hoy, aunque la venta sea de otro día (abono).
- `creditToday`: de las **ventas de hoy** (las que entran en `total`), `max(0, sale.total - pagado en esa venta)`. Es lo que salió fiado hoy.
- `otherToday`: pagos de hoy que no son efectivo ni crédito/CxC (tarjeta, transferencia, depósito).
- `peakHour`: hora (0–23, Guatemala) con mayor `sale.total` de ventas de hoy. Empates: la más temprana. `label` = `` `${HH}:00–${HH+1}:00` `` con `HH` a 2 dígitos. Si no hay ventas: `hour` y `label` `null`.

Efectivo y crédito **no tienen que sumar `total`**: uno es caja del día, el otro es fiado de ventas de hoy. El front los muestra como mix, no como partición exacta.

### 4.2 Órdenes pendientes (cola operativa, todas las fechas)

Buckets **disjuntos**. Una orden cuenta en uno solo. Orden de evaluación:

1. **`preorder`**: `isPreorder === true` **y** `status === pending`
2. **`preparing`**: `status ∈ { pending, preparing, on_hold }`
3. **`delivery`**: `status ∈ { confirmed, ready_for_pickup, out_for_delivery, partially_delivered }`

Fuera de cola: `delivered`, `cancelled`.

- `total` = suma de los tres.
- `oldestMinutes`: de las órdenes en esos tres buckets, `floor((now - sale.date) / 60000)` de la más antigua. `null` si no hay cola.
- `nextCustomer`: esa misma orden más antigua (si hay empate de fecha, la de menor `sale.date` / id estable). `name` del cliente o `"Consumidor final"`.

### 4.3 Por cobrar (cartera, todas las fechas)

Universo: ventas no canceladas con `pendingAmount > 0` (total − pagos aplicados).

- `total`: suma de esos saldos.
- `invoiceCount`: cantidad de esas ventas.
- Vencimiento: usar la fecha de crédito / `dueDate` de la venta (o la que ya use el calendario de cobros). Si no hay fecha, **no** entra en `overdue` ni `dueToday`; sí en `total`.
- `overdue`: saldo cuya fecha de vencimiento es **anterior** a hoy.
- `dueToday`: saldo que vence **hoy** (y no está overdue).
- `topDebtor`: agrupar por `customerId` (`null` = C/F). El grupo con mayor saldo. `null` si `total === 0`.

No recortar `total` al “hoy”. El widget es “cuánto nos deben”, no “cuánto se vendió hoy a crédito” (eso ya está en `sales.creditToday`).

### 4.4 Atención

- `lowStock`: productos con `manageStock === true` y stock **≤ mínimo** en inventarios del alcance, ordenados por (stock / minStock) asc, luego por stock asc. Máximo `lowStockLimit`. Los que no manejan inventario no aparecen.
- `lowStockCount`: total de SKUs que cumplen la condición (aunque la lista esté recortada).
- `quantity` / `unit`: stock actual y unidad del producto (la misma que usa inventario).
- `preordersForToday`: preórdenes **no canceladas** cuya `promisedDeliveryDate` (día civil Guatemala) es **hoy**. Incluye pending y las que ya se confirmó pero aún se entregan hoy. No usar `sale.date`.

---

## 5. Ejemplo

```json
{
  "statusCode": 200,
  "message": "Operación exitosa",
  "data": {
    "date": "2026-09-23",
    "currency": "GTQ",
    "sales": {
      "total": 18450.75,
      "previousTotal": 16415.00,
      "changePercent": 12.4,
      "ticketCount": 23,
      "averageTicket": 802.21,
      "cashToday": 12100.00,
      "creditToday": 6350.75,
      "otherToday": 0,
      "peakHour": { "hour": 11, "label": "11:00–12:00" }
    },
    "pending": {
      "total": 4,
      "preparing": 2,
      "delivery": 1,
      "preorder": 1,
      "oldestMinutes": 42,
      "nextCustomer": {
        "saleId": "…",
        "name": "Fermín Fuentes"
      }
    },
    "receivable": {
      "total": 22715.62,
      "overdue": 4100.00,
      "dueToday": 3200.00,
      "invoiceCount": 8,
      "topDebtor": {
        "customerId": "…",
        "name": "Adriana Fuentes",
        "amount": 8500.00
      }
    },
    "attention": {
      "lowStockCount": 3,
      "preordersForToday": 2,
      "lowStock": [
        { "productId": "…", "name": "Costilla", "quantity": 4.2, "unit": "lb" },
        { "productId": "…", "name": "Cuero nacional", "quantity": 8, "unit": "lb" },
        { "productId": "…", "name": "Adobado", "quantity": 2.5, "unit": "lb" }
      ]
    }
  },
  "timestamp": "2026-09-23T15:00:00.000Z",
  "path": "/api/v1/reports/dashboard/today-pulse"
}
```

Cola vacía / sin cartera / sin stock bajo: ceros y `null` en `peakHour`, `nextCustomer`, `topDebtor`; `lowStock: []`.

---

## 6. Errores

| Caso | HTTP | Notas |
|---|---|---|
| JWT inválido / ausente | 401 | Igual que el resto de reports |
| `branchId` uuid inválido | 400 | `{ statusCode, message, error }` de Nest (sin envoltura) |
| `branchId` inexistente | 400 | `{ statusCode, message: "branchId inexistente", error }` |
| `lowStockLimit` fuera de 1–10 | 400 | Nest validation, sin envoltura |

No devolver 404 por “día sin movimiento”: 200 con ceros.

---

## 7. Fuera de alcance

No incluir en este payload:

- series horarias (ya en `orders/summary.hourlySales`)
- últimas N órdenes
- donut pagadas / pendientes / vencidas por **conteo de facturas** (el pulso usa **Q**)
- matriz semanal ni lista de clientes de la semana
- calendario de cobros del mes

Si el calendario y `receivable` no coinciden en vencidos, alinear la regla de `dueDate` con `GET /reports/dashboard/calendar`.

---

## 8. Cómo usarlo (front)

El pulso es **operativo del día civil en Guatemala**. No manda `date`: el backend usa “hoy” al momento del request.

### Llamada

```http
GET /api/v1/reports/dashboard/today-pulse
Authorization: Bearer <jwt>
```

Query opcional:

| Quién | Qué manda |
|---|---|
| Cajero / usuario de sucursal | nada. El API usa `user.branch.id`. |
| Super admin, una sucursal | `?branchId=<uuid>` |
| Super admin, consolidado | nada (todas las sucursales) |
| Atención: más/menos SKUs | `?lowStockLimit=3` (1–10, default 3) |

Ciclo de vida distinto al semanal: **no** compartir el selector de semana. Refresco típico: al entrar al dashboard y cada 30–60 s (o al volver el tab a foco). No hace falta invalidar `weekly-summary` ni `orders/summary` cuando llega este payload.

Leer siempre `data`, no la raíz. `message` en 200 es `"Operación exitosa"`.

### Mapeo a las 4 cards

| Card | Campos |
|---|---|
| Ventas de hoy | `sales.total`, `sales.changePercent` vs ayer (`previousTotal`), `ticketCount`, `averageTicket`. Mix: `cashToday` / `creditToday` / `otherToday`. Chip hora pico: `peakHour.label` o ocultar si `hour === null`. |
| Órdenes pendientes | `pending.total` y los tres buckets. Subtítulo: `oldestMinutes` + `nextCustomer.name`. Si `total === 0`, cola vacía (`nextCustomer` y `oldestMinutes` son `null`). |
| Por cobrar | `receivable.total` (cartera completa, **no** solo hoy). Desglose `overdue` / `dueToday`. Pie: `invoiceCount` y `topDebtor`. |
| Atención | `attention.lowStock` (máx. `lowStockLimit`). Badge: `lowStockCount` si es mayor que la lista. `preordersForToday` usa `promisedDeliveryDate` de hoy, no `sale.date`. |

Reglas de UI:

- Montos son `number` (GTQ). Formatear en el front.
- `changePercent` ya viene a 1 decimal. `> 0` sube, `< 0` baja, `0` plano. Si ayer era 0 y hoy hay venta, llega `100`.
- `cashToday` + `creditToday` **no** tienen que igualar `sales.total` (caja del día vs fiado de ventas de hoy).
- `peakHour.label` usa en-dash (`11:00–12:00`).
- C/F: `nextCustomer.name` y `topDebtor.name` pueden ser `"Consumidor final"`; `topDebtor.customerId` puede ser `null`.
- Multi-sucursal: `lowStock[].branchName` viene informado. En una sola sucursal se puede ignorar.
- Día sin movimiento: 200 con ceros, no 404. Ejemplo:

```json
{
  "statusCode": 200,
  "message": "Operación exitosa",
  "data": {
    "date": "2026-09-23",
    "currency": "GTQ",
    "sales": {
      "total": 0,
      "previousTotal": 0,
      "changePercent": 0,
      "ticketCount": 0,
      "averageTicket": 0,
      "cashToday": 0,
      "creditToday": 0,
      "otherToday": 0,
      "peakHour": { "hour": null, "label": null }
    },
    "pending": {
      "total": 0,
      "preparing": 0,
      "delivery": 0,
      "preorder": 0,
      "oldestMinutes": null,
      "nextCustomer": null
    },
    "receivable": {
      "total": 0,
      "overdue": 0,
      "dueToday": 0,
      "invoiceCount": 0,
      "topDebtor": null
    },
    "attention": {
      "lowStockCount": 0,
      "preordersForToday": 0,
      "lowStock": []
    }
  },
  "timestamp": "2026-09-23T15:41:00.000Z",
  "path": "/api/v1/reports/dashboard/today-pulse"
}
```

Errores: 401 sin token; 400 de Nest (`message` string o array) si `branchId` / `lowStockLimit` no validan.

### Qué no pedir a este endpoint

Gráfico horario, últimas órdenes, donut de facturas y alertas extra de stock siguen en `GET /reports/orders/summary`. Clientes de la semana en `weekly-summary`. No existe un “dashboard god endpoint”: no usar `GET /reports/dashboard` para el pulso.

---

## 9. Qué hace v1

- “Hoy” / “ayer”: medianoche a 23:59:59.999 `America/Guatemala` (`-06:00`).
- Ventas: `sale.date`, no canceladas; preorden `pending` no suma en `sales.total`.
- `cashToday` / `otherToday`: pagos `completed` del día. Efectivo = `code`/`name` `cash` o `efectivo`. Crédito/CxC como método de pago no entra en `otherToday`. `creditToday` es `max(0, total − paidAmount)` de las **ventas de hoy** que cuentan como venta.
- Cola: buckets disjuntos (preorden pending → preparar → entregar). `delivered` y `cancelled` fuera.
- Cartera: `pendingAmount > 0`. Vencido / vence hoy por `DATE(dueDate)` vs `data.date`. Sin `dueDate` solo entra en `total`.
- Stock bajo: solo `manageStock === true`, `stock <= minStock`, orden `(stock/min)` asc luego stock asc. `lowStockCount` es el universo; la lista está recortada.
- `preordersForToday`: `isPreorder`, no cancelada, `promisedDeliveryDate` en el día civil de hoy.

Fuera de alcance v1: series horarias, últimas N órdenes, comparativo de más de 1 día atrás.
