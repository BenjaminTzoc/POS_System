# Abonos de hoy — contrato backend

Endpoint para el widget del dashboard **Abonos de hoy** (a la derecha del calendario de cobros).

**Estado:** implementado. El front apaga el mock y llama este `GET`.

Zona: **`America/Guatemala`**. Moneda: **GTQ**.

Esto **no** es el calendario de cobros (saldo que todavía deben, por `dueDate`).  
Esto son **pagos que ya entraron hoy**, aunque la venta sea de otro día.

**No** inflar `GET /reports/dashboard/today-pulse`. El pulso ya trae `sales.cashToday` / `otherToday` como totales. Este widget necesita la **lista** y el desglose efectivo vs transferencia vs otros. Ciclo de vida distinto (lista clickeable, se refresca con cada abono).

Tampoco reutilizar un `GET /sale-payment` genérico: falta recorte de sucursal, “hoy” civil GT, KPIs del día completo y el saldo que queda **después** de ese abono.

Código: `src/reports/services/today-payments.service.ts` → `GET /reports/dashboard/today-payments`.

---

## 1. Endpoint

```http
GET /api/v1/reports/dashboard/today-payments
GET /api/v1/reports/dashboard/today-payments?branchId=<uuid>
GET /api/v1/reports/dashboard/today-payments?limit=50
Authorization: Bearer <jwt>
```

Misma envoltura que el resto de reportes:

```ts
{
  statusCode: number;
  message: string; // "Operación exitosa"
  data: TodayPaymentsDto;
  timestamp: string;
  path: string;
}
```

### Autenticación y sucursal

Igual que `GET /reports/dashboard/today-pulse` y el calendario:

- JWT obligatorio.
- Usuario **no** super admin: se ignora `branchId`; siempre `user.branch.id`.
- Super admin: `branchId` opcional. Sin él = todas las sucursales visibles.

### Query params

| Param | Tipo | Obligatorio | Default | Notas |
|---|---|---|---|---|
| `branchId` | uuid | no | sucursal del usuario / todas si super admin | Solo aplica para super admin. |
| `limit` | number 1–100 | no | `50` | Máximo de filas en `payments`. Los KPIs **no** se recortan. |

---

## 2. Universo: qué pagos entran

- Tabla `sale-payment` (o la que ya usa el pulso para `cashToday`).
- `payment.date` (día del cobro) en **`America/Guatemala`** = **hoy** civil (`00:00:00` → `23:59:59.999`).
- Si `date` no tiene hora usable, el reloj de la fila sale de `createdAt` (también en GT). El **día** sigue siendo `DATE(payment.date)` GT, no `createdAt`.
- Status cobrado / `completed` (el mismo que suma a `sale.paidAmount`). **No** anulados / void / rejected.
- Venta **no** `cancelled` y sin `deletedAt`.
- Un enganche (`isDownPayment`) **sí** entra, también en preorden.

Alinear con el pulso: lo que suma `sales.cashToday` + `sales.otherToday` de hoy debe poder reconstruirse desde esta lista **sin recortar** (si `limit` recorta filas, los KPIs del payload sí cubren el día entero).

**No** mezclar:

- ventas a crédito sin pago (`creditToday` del pulso)
- facturas que vencen hoy (eso es el calendario)
- pagos de ayer

---

## 3. Payload `data`

El front **pinta KPIs desde `summary`**, no los recalcula de la lista recortada.

```ts
interface TodayPaymentsDto {
  date: string; // YYYY-MM-DD civil GT
  currency: 'GTQ';
  summary: TodayPaymentsSummaryDto;
  payments: TodayPaymentItemDto[]; // más reciente primero
}

interface TodayPaymentsSummaryDto {
  total: number;       // suma amount del día (universo completo, no el limit)
  count: number;       // cantidad de pagos del día (universo completo)
  cash: number;        // suma método efectivo
  transfer: number;    // suma método transferencia / depósito
  other: number;       // el resto (tarjeta, cheque, etc.)
  settled: number;     // pagos del día que dejaron remainingBalance === 0
}

interface TodayPaymentItemDto {
  id: string;                 // id del pago
  saleId: string;             // para abrir /sales/new-order?id=
  invoiceNumber: string;
  customerName: string;       // cliente, guest, o "Consumidor final"
  customerId: string | null;  // null = C/F / invitado
  amount: number;             // monto de ESTE abono
  remainingBalance: number;   // pendingAmount de la venta DESPUÉS de este pago
  methodCode: 'cash' | 'transfer' | 'card' | 'other';
  methodName: string;         // label para UI: "Efectivo", "Transferencia", …
  paidAt: string;             // ISO; fuente de la hora
  time: string;               // "HH:mm" 24h en America/Guatemala
  reference: string | null;   // referencia / banco+ref; "" → null
  isDownPayment: boolean;
  branchName: string;
  branchId: string;
}
```

### 3.1 Clasificar `methodCode`

Misma idea que el pulso (`cash` / `efectivo` → efectivo). No inventar códigos nuevos en el front.

| `methodCode` | Criterio (code o name, case-insensitive) |
|---|---|
| `cash` | `cash`, `efectivo` |
| `transfer` | `transfer`, `transferencia`, `deposit`, `depósito`, `wire` |
| `card` | `card`, `tarjeta`, `credit_card`, `debit_card` |
| `other` | todo lo demás (cheque, etc.). Crédito/CxC **como método de pago** no debería aparecer: si aparece, `other` y no sumar como cobrado si el pulso ya lo excluye. **Misma regla que `otherToday`.** |

`cash + transfer + other` del `summary` = `total`.  
`card` en la fila entra en `summary.other` (el widget solo tiene chips Efectivo / Transferencia / Liquidadas; tarjeta no tiene KPI propio).

### 3.2 `remainingBalance`

Saldo de la **venta** inmediatamente **después** de aplicar este pago, en orden cronológico del día.

- Si ese abono liquidó: `0`.
- Si hay más abonos el mismo día sobre la misma venta: cada fila lleva el saldo **post** ese pago, no el saldo actual (si después pagaron más, las filas viejas no se reescriben al saldo de ahora).
- Fórmula práctica: ordenar pagos de esa venta por (`date`, `createdAt`), ir restando. O usar `remainingBalance` / `previousBalance` si el recibo ya los guarda (`IReceiptPaymentItem.remainingBalance`).

`summary.settled` = cantidad de **pagos** (no de ventas) con `remainingBalance === 0`.

### 3.3 Orden de `payments[]`

1. `paidAt` desc (más reciente arriba)
2. Empate: `id` desc

Si hay más pagos que `limit`, recortar **después** de ordenar. `summary` sigue siendo el día completo. El front no pagina.

### 3.4 Nombres y textos

- `customerName`: maestro, o `guestCustomer.name`, o `"Consumidor final"`.
- `time`: `HH:mm` zero-padded (`09:15`), zona GT. No mandar `9:15` ni `09:15:00`.
- `reference`: `referenceNumber` si hay. Si hay cuenta bancaria y aporta, concatenar corto (`"{bankName} {referenceNumber}"`). Sin nada → `null`.
- `methodName`: el `name` del método en el maestro (español).

---

## 4. Qué no mandar / no hacer

- PDF, ticket, historial completo de la venta.
- NIT, teléfono, email (el click abre la orden).
- KPIs de “vence hoy” / cartera.
- Cron ni notificación.
- Body. Es `GET`.

---

## 5. Ejemplo

```http
GET /api/v1/reports/dashboard/today-payments
```

```json
{
  "statusCode": 200,
  "message": "Operación exitosa",
  "data": {
    "date": "2026-09-23",
    "currency": "GTQ",
    "summary": {
      "total": 7271,
      "count": 6,
      "cash": 2571,
      "transfer": 4000,
      "other": 700,
      "settled": 1
    },
    "payments": [
      {
        "id": "pay-6",
        "saleId": "sale-55",
        "invoiceNumber": "F-10455",
        "customerName": "Mini Super Mixco",
        "customerId": "…",
        "amount": 1200,
        "remainingBalance": 3000,
        "methodCode": "cash",
        "methodName": "Efectivo",
        "paidAt": "2026-09-23T21:08:00.000Z",
        "time": "15:08",
        "reference": null,
        "isDownPayment": false,
        "branchName": "Planta Central",
        "branchId": "…"
      },
      {
        "id": "pay-5",
        "saleId": "sale-41",
        "invoiceNumber": "F-10441",
        "customerName": "Tienda San José",
        "customerId": "…",
        "amount": 700,
        "remainingBalance": 1300,
        "methodCode": "card",
        "methodName": "Tarjeta",
        "paidAt": "2026-09-23T19:22:00.000Z",
        "time": "13:22",
        "reference": "POS-19",
        "isDownPayment": false,
        "branchName": "Xela",
        "branchId": "…"
      },
      {
        "id": "pay-2",
        "saleId": "sale-62",
        "invoiceNumber": "F-10462",
        "customerName": "Distribuidora Morales",
        "customerId": "…",
        "amount": 1500,
        "remainingBalance": 571,
        "methodCode": "transfer",
        "methodName": "Transferencia",
        "paidAt": "2026-09-23T15:15:00.000Z",
        "time": "09:15",
        "reference": "Banco Industrial 882193",
        "isDownPayment": false,
        "branchName": "Planta Central",
        "branchId": "…"
      },
      {
        "id": "pay-1",
        "saleId": "sale-23",
        "invoiceNumber": "ORD-2026-0023",
        "customerName": "Benjamin Tzoc",
        "customerId": "…",
        "amount": 571,
        "remainingBalance": 0,
        "methodCode": "cash",
        "methodName": "Efectivo",
        "paidAt": "2026-09-23T14:42:00.000Z",
        "time": "08:42",
        "reference": null,
        "isDownPayment": false,
        "branchName": "Planta Central",
        "branchId": "…"
      }
    ]
  }
}
```

Día vacío:

```json
{
  "date": "2026-09-23",
  "currency": "GTQ",
  "summary": {
    "total": 0,
    "count": 0,
    "cash": 0,
    "transfer": 0,
    "other": 0,
    "settled": 0
  },
  "payments": []
}
```

---

## 6. Checklist backend

- [x] `GET /reports/dashboard/today-payments` nuevo (no el pulso, no el calendario, no `GET /sale-payment` crudo).
- [x] Día civil GT por `payment.date`; hora GT en `time`.
- [x] Solo pagos cobrados; ventas no canceladas.
- [x] Sucursal igual que el pulso.
- [x] `summary` del **día completo**; `payments` recortado a `limit`, más reciente primero.
- [x] `saleId` siempre; click del front abre la orden.
- [x] `remainingBalance` post-pago; `settled` = filas con saldo 0.
- [x] `methodCode` cash / transfer / card / other; `card` suma en `summary.other`. CxC como método se excluye (igual que `otherToday` del pulso).
- [x] `reference` y `customerName` con las reglas de arriba.
- [x] Día sin movimientos: arrays/ceros, no 404.

---

## 7. Cómo usarlo (front)

```http
GET /api/v1/reports/dashboard/today-payments
GET /api/v1/reports/dashboard/today-payments?limit=50
GET /api/v1/reports/dashboard/today-payments?branchId=<uuid>
Authorization: Bearer <jwt>
```

- No mandar fecha: es **hoy** civil en Guatemala.
- Sucursal: usuario normal = la suya; super admin puede filtrar o ver todas.
- Pintar chips/totales desde **`data.summary`**, no desde `payments` (la lista puede estar recortada).
- `cash + transfer + other === total` (tarjeta va en `other`).
- Click de fila: `/sales/new-order?id={saleId}` (o la ruta de detalle que ya usen).
- `time` ya viene `HH:mm` en GT; `paidAt` es ISO para ordenar o tooltips.
- `remainingBalance === 0` = ese abono liquidó (sirve el chip “Liquidadas” junto a `summary.settled`).
- Refresco: al entrar al dashboard y cuando se registra un abono (ciclo más corto que el calendario).
- Día vacío: 200 con `payments: []` y ceros. `limit` fuera de 1–100 o `branchId` inválido → 400 Nest.

Alinear visualmente con el pulso: `summary.cash` ≈ `sales.cashToday`; `summary.transfer + summary.other` ≈ `sales.otherToday`.
