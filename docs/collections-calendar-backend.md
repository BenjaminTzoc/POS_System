# Calendario de cobros + recordatorio — contrato backend

Para el widget del dashboard **Calendario de cobros**.

**Estado:** implementado. El front apaga el mock, deja de abrir `wa.me` y llama estos endpoints.

Zona: **`America/Guatemala`**. Moneda: **GTQ**. Fechas civiles: `YYYY-MM-DD`.

**No** mezclar esto en `GET /reports/dashboard/today-pulse` ni en un dashboard unificado. El calendario es mensual y el recordatorio es una acción puntual.

Código:

- Calendario: `src/reports/services/consolidated-reports.service.ts` → `getDashboardCalendar`
- Recordatorio: `POST` en `src/sales/controllers/sale.controller.ts` → `sendCollectionReminder`
- Persistencia: `sales.collection_last_reminded_at`

---

## 0. Reutilizar `POST /sales/:id/send-whatsapp`: no

Ese endpoint manda el **ticket / PDF de la venta**. No sirve para cobro.

| | `send-whatsapp` actual | Recordatorio de cobro |
|---|---|---|
| Documento | ticket / PDF | ninguno (texto) |
| Cuándo tiene sentido | venta cobrada o para reenviar comprobante | saldo `pendingAmount > 0` |
| Copy | ticket | factura + saldo + límite de pago |
| Auditoría | envío de ticket | `lastRemindedAt` de cobranza |

**Sí reutilizar** por dentro el mismo *transporte* de WhatsApp (el servicio que ya usa `send-whatsapp`: Meta Cloud, Evolution, etc.). El HTTP es **otro**.

```http
POST /api/v1/sales/:saleId/collection-reminder
```

No aceptar `pdfBase64`. No mandar el ticket.

No hay envío automático. Solo cuando el admin pulsa el botón.

---

## 1. Ampliar el calendario existente

```http
GET /api/v1/reports/dashboard/calendar?month=9&year=2026
GET /api/v1/reports/dashboard/calendar?month=9&year=2026&branchId=<uuid>
Authorization: Bearer <jwt>
```

Misma envoltura que el resto de reportes:

```ts
{
  statusCode: number;
  message: string;
  data: DashboardCalendarDto;
  timestamp: string;
  path: string;
}
```

### Autenticación y sucursal

Igual que `GET /reports/dashboard/today-pulse` y `GET /reports/customers/weekly-summary`:

- JWT obligatorio.
- Usuario **no** super admin: se ignora `branchId`; siempre `user.branch.id`.
- Super admin: `branchId` opcional. Sin él = todas las sucursales visibles.

### Query params

| Param | Tipo | Obligatorio | Default | Notas |
|---|---|---|---|---|
| `month` | 1–12 | no | mes civil actual GT | Mes de `dueDate`, no de `sale.date`. |
| `year` | number | no | año civil actual GT | |
| `branchId` | uuid | no | ver regla de sucursal | Solo aplica a super admin. |

---

## 2. Qué ventas entran en el calendario

Universo:

- venta **no** `cancelled` y sin `deletedAt`
- `pendingAmount > 0` (mismo criterio que cartera del pulso: `total − pagos applied/completed`)
- `dueDate` **no null**

**Fuera del calendario:** saldo abierto **sin** `dueDate`. Siguen en `receivable.total` del pulso, pero no hay día donde pintarlas.

**No** meter en un día:

- `sale.date` (día de la venta)
- `billingStartDate` (solo se muestra en la fila)
- `promisedDeliveryDate` (eso es entrega, no cobro)

### Clave del mapa

`DATE(dueDate)` en `America/Guatemala` → `"YYYY-MM-DD"`.

Una venta aparece **una sola vez**, en su día de límite de pago. Si está vencida, sigue colgada en ese día (el del `dueDate` original), no se replica en “hoy”. El front pinta la celda en rosa con `isOverdue`.

El mes pedido (`month`/`year`) recorta por esa clave. Una factura que venció en agosto **no** sale en septiembre.

### Alinear con el pulso

Misma regla de vencido que `receivable` en today-pulse:

- `overdue`: `DATE(dueDate) < hoy` y saldo > 0
- `dueToday`: `DATE(dueDate) === hoy` y saldo > 0
- `isOverdue` en cada orden: `DATE(dueDate) < hoy`

`hoy` = fecha civil actual en Guatemala, no UTC.

---

## 3. Forma de `data` (compatible)

El endpoint **ya existe**. No romper la forma; **ampliar** `orders[]`.

Hoy el front espera:

```ts
type DashboardCalendarDto = {
  [date: string]: CalendarEventDto[]; // date = YYYY-MM-DD
};

interface CalendarEventDto {
  type: string;
  label: string;
  count: number;
  total: number;
  color: string;
  dotColor: string;
  orders: CalendarOrderDto[];
}
```

Si hoy hay varios `type` por día (colores/dots), se puede dejar. El widget de cobros **aplana** todos los `orders` del día y deduplica por `saleId`.

Reglas:

- `count` = cantidad de órdenes en ese grupo (no líneas de producto).
- `total` = suma de `pendingAmount` de esas órdenes (saldo, no `sale.total`).
- Un `saleId` no debe repetirse el mismo día entre grupos.

Si el calendario actual mezcla eventos que **no** son CxC (entregas, etc.), **sacarlos** de este GET o ponerles `type` distinto **y `orders: []`**. Este widget solo debe ver facturas por cobrar.

---

## 4. `CalendarOrderDto` — campos

### Ya existen (seguir mandándolos)

| Campo | Tipo | Notas |
|---|---|---|
| `invoiceNumber` | string | |
| `customerName` | string | Cliente maestro, o `guestCustomer.name`, o `"Consumidor final"` si C/F sin nombre. |
| `pendingAmount` | number | Saldo. |
| `total` | number | `sale.total`. |
| `isOverdue` | boolean | Ver §2. |

### Agregar (obligatorios para el mock actual)

| Campo | Tipo | Fuente | Notas |
|---|---|---|---|
| `saleId` | uuid | `sale.id` | **Obligatorio.** Click, abono y recordatorio. |
| `paidAmount` | number | `sale.paidAmount` | `paidAmount + pendingAmount` debe cuadrar con `total` (tolerancia 0.01). |
| `billingStartDate` | `YYYY-MM-DD` \| null | `sale.billingStartDate` | Inicio de cobro. `null` si no hay. Civil GT. |
| `dueDate` | `YYYY-MM-DD` | `sale.dueDate` | Misma fecha que la clave del mapa. Civil GT. Nunca null en este payload. |
| `phone` | string \| null | `customer.phone` o `guestCustomer.phone` | Vacío / solo espacios → `null`. No inventar. |
| `customerId` | uuid \| null | `sale.customerId` | `null` = C/F / invitado. |
| `branchName` | string | `sale.branch.name` | Super admin ve mix de sucursales. |
| `isPreorder` | boolean | `sale.isPreorder === true` | |
| `delivered` | boolean | `sale.deliveredAt != null` **o** `status === 'delivered'` | Lo que ya use el listado de órdenes. |
| `notes` | string \| null | `sale.notes` | Nota de la orden (instrucción de cobro). `""` → `null`. |
| `lastPaymentDate` | `YYYY-MM-DD` \| null | último pago válido | Ver §4.1. |
| `lastPaymentAmount` | number \| null | `amount` de ese pago | Los dos null juntos, o los dos con valor. |
| `lastRemindedAt` | string (ISO) \| null | ver §5 | `null` si nunca se envió recordatorio de cobro. |

No mandar: NIT, email, productos, IVA, límite de crédito, historial completo de abonos, PDF.

### 4.1 Último abono

De `sale-payment` de esa venta:

- `status` cobrado / completed (el mismo que cuenta para `paidAmount`)
- no anulado
- el de `date` más reciente; empate → `createdAt` más reciente

`lastPaymentDate` = día civil GT de `payment.date`.

Si no hay abonos válidos: ambos campos `null`. Un enganche (`isDownPayment`) **sí** cuenta.

### 4.2 Orden de `orders[]` en un día

1. `isOverdue` desc (vencidas primero)
2. `pendingAmount` desc
3. `invoiceNumber` asc

---

## 5. Recordatorio manual — endpoint nuevo

```http
POST /api/v1/sales/:saleId/collection-reminder
Authorization: Bearer <jwt>
Content-Type: application/json
```

Body: `{}` o ausente. Nada de PDF, teléfono ni texto libre. El servidor arma el mensaje.

### Quién puede

Misma regla de sucursal que el GET:

- No super admin: 403 si la venta no es de `user.branch.id`.
- Super admin: cualquier sucursal visible.

No hace falta un permiso extra si el usuario ya ve el dashboard / la orden. Si el proyecto ya tiene un permiso de “enviar WhatsApp”, reutilizarlo.

### Cuándo aceptar (400 si no)

| Condición | Mensaje sugerido (`message`) |
|---|---|
| Venta no existe / `deletedAt` | `No se encontró la orden.` (404) |
| `cancelled` | `No se puede recordar una orden cancelada.` |
| `pendingAmount <= 0` | `La orden no tiene saldo pendiente.` |
| `dueDate` null | `La orden no tiene límite de pago.` |
| Sin teléfono (cliente e invitado) | `El cliente no tiene teléfono registrado.` |

### Antispam

Si `lastRemindedAt` existe y fue hace **menos de 4 horas** (reloj del servidor):

- **409**
- `message`: `Ya se envió un recordatorio hace poco.`
- `data.lastRemindedAt` = el ISO anterior

El admin no reintenta en silencio. El front muestra el 409.

No hay cola ni cron. Un click = un envío.

### Mensaje WhatsApp (fijo en backend)

Idioma español. Montos con `Q` y miles `es-GT`, sin decimales si son `.00`.

```
Hola {nombre}, le recordamos el saldo pendiente de {pendingAmount} de la factura #{invoiceNumber}. Límite de pago: {dueDate dd/MM/yyyy}.
```

- `{nombre}` = mismo criterio que `customerName`.
- No adjuntar PDF.
- Si el proveedor exige plantilla Meta (`utility` / `AUTHENTICATION` no aplica; es `utility` de cobro), usar esa plantilla con los mismos 3 parámetros: nombre, saldo, factura+fecha. El front no elige plantilla.

Teléfono:

- Dígitos del `phone`.
- Si tiene 8 dígitos, prefijo `502`.
- Si ya viene `502…`, no duplicar.

Reutilizar el cliente WhatsApp de `send-whatsapp`. Si ese envío falla, **500** con mensaje de proveedor; **no** marcar `lastRemindedAt`.

### Persistencia

Tras envío OK, guardar `lastRemindedAt = now` (ISO).

Opciones (una sola, la que encaje):

1. Columna en `sales` (`collection_last_reminded_at`).
2. Tabla de avisos (`sale_id`, `channel`, `sent_at`, `to`). El calendario lee el `sent_at` más reciente de canal WhatsApp/cobro.

El GET del calendario debe devolver ese valor en `lastRemindedAt`.

No es un chat: no guardar el texto.

### Respuesta 201 / 200

```ts
interface CollectionReminderResultDto {
  saleId: string;
  channel: 'whatsapp';
  to: string;          // dígitos con 502, se puede enmascarar 502****4411
  sentAt: string;      // ISO
  lastRemindedAt: string; // igual a sentAt
}
```

Ejemplo:

```json
{
  "statusCode": 201,
  "message": "Recordatorio enviado",
  "data": {
    "saleId": "…",
    "channel": "whatsapp",
    "to": "50253024411",
    "sentAt": "2026-09-23T21:10:00.000Z",
    "lastRemindedAt": "2026-09-23T21:10:00.000Z"
  }
}
```

El front actualiza la fila (deshabilitar / “enviado hace 2 min”) sin recargar el mes.

---

## 6. Qué no implementar en este ticket

- Recordatorio por correo.
- Cron / “avisar a todos los vencidos”.
- Cuotas / plan de pagos (no existen; el cobro es `billingStartDate` → `dueDate` + abonos).
- Registrar abono desde el calendario: el front usará el flujo ya existente (`POST /sale-payment`) **más adelante**. Este md no pide un endpoint de pago nuevo.
- Recalcular KPIs del widget en el backend. El front los saca del mes cargado: por cobrar del mes, vencido, vence hoy, esta semana (lun–dom GT).

---

## 7. Ejemplo de un día

`GET …/calendar?month=9&year=2026` — fragmento de `data["2026-09-23"]`:

```json
[
  {
    "type": "collection",
    "label": "Por cobrar",
    "count": 2,
    "total": 3771,
    "color": "#fffbeb",
    "dotColor": "#d97706",
    "orders": [
      {
        "saleId": "a1b2c3d4-…",
        "invoiceNumber": "F-10470",
        "customerName": "Tienda La Esperanza",
        "customerId": "…",
        "phone": "5302-4411",
        "pendingAmount": 3200,
        "paidAmount": 0,
        "total": 3200,
        "billingStartDate": "2026-09-15",
        "dueDate": "2026-09-23",
        "isOverdue": false,
        "lastPaymentDate": null,
        "lastPaymentAmount": null,
        "lastRemindedAt": null,
        "branchName": "Central",
        "isPreorder": true,
        "delivered": false,
        "notes": "No entregar el restante hasta liquidar."
      },
      {
        "saleId": "e5f6…",
        "invoiceNumber": "F-10462",
        "customerName": "Distribuidora Morales",
        "customerId": "…",
        "phone": "4218-9055",
        "pendingAmount": 571,
        "paidAmount": 1929,
        "total": 2500,
        "billingStartDate": "2026-09-10",
        "dueDate": "2026-09-23",
        "isOverdue": false,
        "lastPaymentDate": "2026-09-20",
        "lastPaymentAmount": 500,
        "lastRemindedAt": "2026-09-22T16:00:00.000Z",
        "branchName": "Central",
        "isPreorder": false,
        "delivered": true,
        "notes": null
      }
    ]
  }
]
```

Día vencido (`dueDate` 2026-09-12, hoy 2026-09-23): misma forma, `isOverdue: true`. Sigue bajo la clave `"2026-09-12"`.

C/F sin teléfono:

```json
{
  "saleId": "…",
  "invoiceNumber": "F-10471",
  "customerName": "Consumidor final",
  "customerId": null,
  "phone": null,
  "pendingAmount": 1800,
  "paidAmount": 2200,
  "total": 4000,
  "billingStartDate": "2026-09-08",
  "dueDate": "2026-09-23",
  "isOverdue": false,
  "lastPaymentDate": "2026-09-15",
  "lastPaymentAmount": 2200,
  "lastRemindedAt": null,
  "branchName": "Xela",
  "isPreorder": false,
  "delivered": true,
  "notes": null
}
```

El botón de recordatorio se deshabilita si `phone === null`. El POST igual debe rechazar (no fiarse solo del front).

---

## 8. Checklist backend

- [x] `GET /reports/dashboard/calendar` sigue igual de ruta/query; `orders[]` con los campos nuevos.
- [x] Clave = `DATE(dueDate)` Guatemala; sin `dueDate` no entra.
- [x] Solo saldo > 0, no canceladas.
- [x] `isOverdue` alineado con cartera del pulso.
- [x] `saleId` siempre presente (`id` se mantiene igual a `saleId` por compatibilidad).
- [x] `phone` null si no hay.
- [x] Último abono = último pago `completed`, o ambos null.
- [x] `POST /sales/:saleId/collection-reminder` **nuevo** (no `send-whatsapp`).
- [x] Reusa el transporte WhatsApp interno (Meta Cloud API).
- [x] 400 / 403 / 404 / 409 como la tabla.
- [x] Persiste `collectionLastRemindedAt` solo si el proveedor respondió OK.
- [x] Sin cron.

---

## 9. Cómo usarlo (front)

### Calendario

```http
GET /api/v1/reports/dashboard/calendar?month=9&year=2026
Authorization: Bearer <jwt>
```

- Sin `month`/`year`: mes y año civiles actuales en Guatemala.
- Sucursal: igual que el pulso (usuario normal = su sucursal; super admin puede mandar `branchId`).
- `data` es un mapa `{ "YYYY-MM-DD": CalendarEventDto[] }`. Días sin cobros **no** aparecen (no mandar arrays vacíos).
- Un día trae un grupo `type: "collection"` (`label: "Por cobrar"`). Aplanar `orders` de todos los grupos y deduplicar por `saleId`.
- Pintar la celda vencida con `order.isOverdue` (`dueDate < hoy` GT). La factura vencida **sigue en el día de su `dueDate`**, no se mueve a hoy.
- KPIs del widget (por cobrar del mes, vencido, vence hoy, esta semana): calcularlos en el front con el mes cargado. El GET no los manda.
- Recordatorio: deshabilitar si `phone === null`. Tras un 201, actualizar `lastRemindedAt` de esa fila sin recargar el mes. Si el click fue hace < 4 h, el API responde **409** (`data.lastRemindedAt`).

`type` cambió de `pending_payment` a **`collection`**. El widget no debe filtrar solo el label viejo.

### Recordatorio

```http
POST /api/v1/sales/:saleId/collection-reminder
Authorization: Bearer <jwt>
Content-Type: application/json
```

Body vacío `{}` o ausente. **No** mandar PDF ni teléfono.

Permiso: `orders.view`. 403 si la venta es de otra sucursal (no super admin).

El servidor arma el texto y llama Meta. Plantilla por defecto: `recordatorio_cobro` (override `WHATSAPP_COLLECTION_REMINDER_TEMPLATE`), idioma `WHATSAPP_TEMPLATE_LANGUAGE` (`es_MX`).

Body de plantilla, 3 parámetros:

1. nombre  
2. saldo (`Q1,200` / `Q1,200.50`)  
3. `#F-10470. Límite de pago: 23/09/2026`

Si Meta falla: **500**, no se guarda `lastRemindedAt`.

201 típico: `message` = `"Recordatorio enviado"` (o el del interceptor si el envelope pisa el campo); leer `data.saleId`, `data.to`, `data.sentAt`, `data.lastRemindedAt`.
