# Carpetas de órdenes — contrato backend

Agrupar órdenes de venta en **carpetas compartidas por sucursal**. No son listas privadas por usuario: caja, almacén y admin de esa sucursal ven las mismas carpetas.

Una orden puede estar en **varias** carpetas de su sucursal. Quitarla de una carpeta **no** borra la venta.

---

## Endpoints

Base: `/api/v1/sale-folders`  
JWT. Permiso `orders.view` para leer; `orders.update` para crear, editar, borrar y meter/sacar órdenes.

Sucursal:

- Usuario normal: siempre su `user.branch.id`. Se ignora `branchId` del query/body.
- Super admin: en el listado `branchId` es opcional (sin él, todas las sucursales). Al **crear**, `branchId` es obligatorio.

```http
GET    /sale-folders
GET    /sale-folders?branchId=<uuid>
POST   /sale-folders
GET    /sale-folders/:id
PUT    /sale-folders/:id
DELETE /sale-folders/:id
POST   /sale-folders/:id/sales
DELETE /sale-folders/:id/sales/:saleId
PUT    /sale-folders/:id/sales/reorder
```

Filtro en el listado de ventas:

```http
GET /sales?folderId=<uuid>
GET /sales/table?folderId=<uuid>
```

Con `folderId` no se aplica el recorte de 6 meses.

---

## Payloads

### Crear

```json
{
  "name": "Navidad 2026",
  "color": "#c2410c",
  "branchId": "uuid-solo-super-admin",
  "sortOrder": 0
}
```

Respuesta carpeta:

```json
{
  "id": "…",
  "name": "Navidad 2026",
  "color": "#c2410c",
  "sortOrder": 0,
  "branchId": "…",
  "branchName": "Planta Central",
  "saleCount": 0,
  "createdById": "…",
  "createdAt": "2026-09-23T23:00:00.000Z"
}
```

### Detalle `GET /sale-folders/:id`

Igual que arriba + `sales[]`:

```json
{
  "saleId": "…",
  "invoiceNumber": "F-10470",
  "customerName": "Tienda La Esperanza",
  "status": "pending",
  "total": 3200,
  "date": "2026-09-20T15:00:00.000Z",
  "sortOrder": 0
}
```

### Metar órdenes

```json
{ "saleIds": ["uuid-1", "uuid-2"] }
```

400 si alguna venta es de **otra sucursal**. Las que ya están en la carpeta se ignoran.

### Reordenar

```json
{
  "items": [
    { "saleId": "uuid-1", "sortOrder": 0 },
    { "saleId": "uuid-2", "sortOrder": 1 }
  ]
}
```

---

## Errores

| Caso | HTTP |
|---|---|
| Carpeta no existe | 404 |
| Nombre duplicado en la sucursal | 400 |
| Venta de otra sucursal | 400 |
| Usuario sin sucursal / carpeta ajena | 400 / 403 |
| Super admin crea sin `branchId` | 400 |

---

## Front

- Sidebar de carpetas: `GET /sale-folders` (ya filtrado a la sucursal del usuario).
- Click carpeta: `GET /sales/table?folderId=` o el detalle `GET /sale-folders/:id`.
- Arrastrar órdenes: `POST .../sales` y `DELETE .../sales/:saleId`.
- No hace falta un “mis carpetas”: son de la sucursal.
