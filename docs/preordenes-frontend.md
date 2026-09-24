# Preórdenes — guía para el front

API base: `/api/v1`. JWT en todos los endpoints (salvo los que ya eran públicos).

Este documento describe **solo lo que el front tiene que implementar** para pedidos anticipados (ej. Navidad en septiembre, entrega en diciembre). El backend ya está listo.

---

## 1. Conceptos (no mezclar)

| Campo | Significado | UI |
|---|---|---|
| `date` | Cuándo se tomó el pedido | Fecha de la orden |
| `dueDate` | Hasta cuándo el cliente puede **pagar** | “Límite de pago” |
| `promisedDeliveryDate` | Cuándo se **entrega** | “Fecha de entrega” — obligatorio si es preorden |
| `isPreorder` | Pedido a futuro | Switch “Preorden” |
| `status` | Ciclo de la orden | `pending` hasta surtir; `confirmed` = ya salió kárdex |
| `pendingAmount` / `paidAmount` | Saldo vs cobrado | Independiente de `status` |

Una preorden **no exige stock** al crearla, **no reserva** inventario y los **abonos no confirman** la venta.

`POST /sales/quick` (venta rápida / POS) **no** es preorden. No mostrar el switch ahí.

Productos con `manageStock === false` (ej. Adobado) se venden igual; no bloquean por cantidad ni generan kárdex.

---

## 2. Flujos

### A. Orden nueva como preorden

Pantalla de **orden de venta** (no POS).

1. Switch Preorden ON → mostrar datepicker **Fecha de entrega** (required).
2. `dueDate` opcional (límite de cobro). Puede ser la misma fecha de entrega.
3. **No** deshabilitar productos por stock 0.
4. Crear:

```http
POST /sales
Content-Type: application/json
```

```json
{
  "isPreorder": true,
  "promisedDeliveryDate": "2026-12-20T00:00:00.000Z",
  "dueDate": "2026-12-20T00:00:00.000Z",
  "date": "2026-09-22T00:00:00.000Z",
  "customerId": "<uuid>",
  "branchId": "<uuid>",
  "applyTax": true,
  "notes": "Pedido Navidad",
  "details": [
    {
      "productId": "<uuid>",
      "quantity": 10,
      "unitPrice": 45
    }
  ]
}
```

Respuesta: `status: "pending"`, `isPreorder: true`.

Aviso sugerido: “Preorden: el inventario se descuenta al confirmar, cuando ya haya stock en la sucursal.”

---

### B. Orden normal, luego marcar preorden

1. `POST /sales` **sin** `isPreorder` (o `false`). Ahí sí valida stock y reserva.
2. Mientras `status === "pending"`:

```http
PUT /sales/{id}
```

```json
{
  "isPreorder": true,
  "promisedDeliveryDate": "2026-12-20T00:00:00.000Z"
}
```

Eso suelta la reserva.

Para quitar preorden: `PUT` con `"isPreorder": false` (vuelve a exigir stock).

**No se puede** marcar preorden si la orden ya está confirmada. El PUT de detalles/preorden solo funciona en `pending`.

---

### C. Desde cotización (flujo principal)

La cotización **no** nace como preorden.

1. Cotizar como hoy: `POST /quotations`, editar, PDF, email/WhatsApp.
2. Convertir **sin** flags de preorden:

```http
POST /quotations/{id}/convert
Content-Type: application/json

{}
```

Respuesta: `{ "saleId": "<uuid>" }`.

La venta queda `pending`, `isPreorder: false`, con reserva de stock. **Ya no confirma ni saca kárdex** al convertir.

3. Abrir esa orden y marcar preorden (mismo `PUT` del flujo B).

En UI de cotización: un solo botón **“Convertir a orden”**. No pongas “Convertir a preorden”.

El body de convert acepta `isPreorder` + `promisedDeliveryDate` por si acaso; **no lo uses en pantallas**.

---

### D. Abonos

Sirve igual para venta normal y preorden.

```http
POST /sale-payment
```

```json
{
  "saleId": "<uuid>",
  "paymentMethodId": "<uuid>",
  "amount": 500,
  "date": "2026-09-22T00:00:00.000Z"
}
```

En preorden **no** envíes `isDownPayment`. El backend trata el cobro como anticipo y **no confirma**.

Parciales: `POST /sale-payment/partial/{saleId}` (mismo criterio).

Documentos:

| Qué | Endpoint |
|---|---|
| JSON estado de cuenta | `GET /sale-payment/sale/{saleId}/receipt` |
| PDF recibo de abonos | `GET /sale-payment/sale/{saleId}/receipt/pdf` |
| Nota de cargo (PDF) | `GET /sales/{id}/pdf` |

La **nota de cargo** muestra el total de la orden (no resta abonos).  
El **recibo** muestra historial + saldo restante + fecha de entrega si existe.

Título del PDF de recibo: **RECIBO DE ABONOS**. NIT consumidor final: **C/F**.

---

### E. Confirmar y entregar (cuando ya hay producto)

No hay un endpoint especial de “producir para esta preorden”. Basta con que la **sucursal de la orden** tenga **stock disponible** (`físico − reservado` de otras órdenes).

Da igual si el stock llegó por compra, despiece, manufactura, traslado o ajuste.

```http
POST /sales/{id}/confirm
```

- Valida stock solo en líneas con `manageStock: true`.
- `manageStock: false` se confirma igual, sin kárdex.
- Pasa a `confirmed`.

Si no alcanza:

```json
{
  "statusCode": 400,
  "message": "No se puede confirmar la preorden: no hay stock suficiente. ...",
  "errors": ["Producto \"X\" - Stock insuficiente ..."]
}
```

Entrega:

```http
POST /sales/{id}/deliver
```

Cancelar (pending o después): `POST /sales/{id}/cancel`.

---

## 3. Listados

```http
GET /sales?isPreorder=true
GET /sales?isPreorder=true&promisedDeliveryStart=2026-12-01&promisedDeliveryEnd=2026-12-31
GET /sales?status=pending&isPreorder=true
```

Si mandas `isPreorder` o fechas de entrega, **no** aplica el filtro default de últimos 6 meses.

En tabla / kanban:

- Badge **Preorden** si `isPreorder`.
- Mostrar `promisedDeliveryDate` (entrega) y `dueDate` (pago) por separado.
- `confirmed` ≠ “ya pagó”. Mira `pendingAmount`.

Campos en `SaleResponseDto` (además de lo que ya había):

- `isPreorder: boolean`
- `promisedDeliveryDate: string | null`

El JSON del recibo también trae `isPreorder` y `promisedDeliveryDate`.

---

## 4. Reglas de formulario

**Alta / edición (`pending`)**

- Switch Preorden → `promisedDeliveryDate` visible y required.
- `dueDate` = límite de cobro, no de entrega.
- Preorden ON: no bloquees catálogo por stock 0.
- Preorden OFF: validación de stock como siempre.
- `manageStock === false`: no uses cantidad de stock como bloqueo; es ítem de catálogo/disponibilidad.

**Qué no hacer**

- Preorden en venta rápida.
- Convertir cotización con `isPreorder` en el UI.
- Restar abonos del total de la nota de cargo.
- Confirmar el mismo día si aún no hay producto en **esa** sucursal.

---

## 5. Secuencia típica Navidad

```text
Sep   Cotización     POST /quotations
Sep   Convertir      POST /quotations/:id/convert   →  { saleId }
Sep   Marcar         PUT /sales/:id
                     { isPreorder: true, promisedDeliveryDate: "2026-12-20" }
Sep–Dic  Abonos      POST /sale-payment
                     PDF: GET /sale-payment/sale/:id/receipt/pdf
Dic   Stock en sucursal (compra / producción / traslado)
Dic   Confirmar      POST /sales/:id/confirm
Dic   Entregar       POST /sales/:id/deliver
```

Alta directa sin cotizar: `POST /sales` con `isPreorder` + `promisedDeliveryDate`, y el resto igual desde abonos.

---

## 6. Checklist de pantallas

- [ ] Orden nueva: switch Preorden + fecha de entrega
- [ ] Orden pendiente: poder marcar / desmarcar preorden (`PUT`)
- [ ] Cotización: solo “Convertir a orden”, luego preorden en la venta
- [ ] Listado: filtro y badge Preorden; columna fecha de entrega
- [ ] Abonos + PDF recibo (historial consolidado)
- [ ] Nota de cargo sin restar abonos; sí mostrar fecha de entrega si viene
- [ ] Confirmar: manejar 400 de stock insuficiente
- [ ] Venta rápida: sin preorden
