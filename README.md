# POS System API Documentation

This project is a comprehensive Point of Sale (POS) system built with NestJS. Below is the documentation for all available API endpoints, organized by module.

## Table of Contents
- [Auth Module](#auth-module)
- [Finances Module](#finances-module)
- [Logistics Module](#logistics-module)
- [Purchases Module](#purchases-module)
- [Reports Module](#reports-module)
- [Sales Module](#sales-module)

---

## Auth Module
Endpoints for managing permissions, roles, and users.

### Permissions
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/permissions` | Create a new permission. |
| GET | `/permissions` | List all permissions. |
| GET | `/permissions/:id` | Get details of a specific permission. |
| PUT | `/permissions/:id` | Update a permission. |
| DELETE | `/permissions/:id` | Soft delete a permission. |
| PATCH | `/permissions/:id/restore` | Restore a deleted permission. |

### Roles
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/roles` | Create a new role. |
| GET | `/roles` | List all roles. |
| GET | `/roles/:id` | Get details of a specific role. |
| PUT | `/roles/:id` | Update a role. |
| DELETE | `/roles/:id` | Soft delete a role. |
| PATCH | `/roles/:id/restore` | Restore a deleted role. |

### Users
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/users` | Create a new user. |
| GET | `/users` | List all users (Requires `users.manage`). |
| GET | `/users/:id` | Get details of a specific user. |
| GET | `/users/email/:email` | Find a user by email. |
| PUT | `/users/:id` | Update a user. |
| DELETE | `/users/:id` | Remove a user. |
| PATCH | `/users/:id/restore` | Restore a deleted user. |
| POST | `/users/login` | Authenticate a user and receive a JWT. |

---

## Finances Module
Endpoints for managing financial entities like bank accounts and cash registers.

### Bank Accounts
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET | `/bank-accounts` | List all bank accounts. |
| GET | `/bank-accounts/:id` | Get details of a specific bank account. |

### Cash Registers
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/cash-registers/open` | Open a new cash register session. |
| GET | `/cash-registers/status` | Get the status of the current user's cash register. |
| POST | `/cash-registers/close/:id` | Close an open cash register session. |
| GET | `/cash-registers/history` | Get cash register history with filters. |

---

## Logistics Module
Endpoints for managing branches, products, inventory, and logistics.

### Areas
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/logistics/areas` | Create a new preparation area. |
| GET | `/logistics/areas` | List all areas. |
| GET | `/logistics/areas/:id` | Get details of a specific area. |
| PATCH | `/logistics/areas/:id` | Update an area. |
| DELETE | `/logistics/areas/:id` | Remove an area. |
| PATCH | `/logistics/areas/:id/restore` | Restore a deleted area. |

### Branches
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/branches` | Create a new branch. |
| GET | `/branches` | List all branches. |
| GET | `/branches/search` | Search branches by query string. |
| GET | `/branches/stats` | Get branch statistics. |
| GET | `/branches/:id` | Get details of a specific branch. |
| PUT | `/branches/:id` | Update a branch. |
| DELETE | `/branches/:id` | Remove a branch. |
| PATCH | `/branches/:id/restore` | Restore a deleted branch. |

### Categories
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/products/categories` | Create a new product category. |
| GET | `/products/categories` | List all categories. |
| GET | `/products/categories/:id` | Get details of a specific category. |
| PUT | `/products/categories/:id` | Update a category. |
| DELETE | `/products/categories/:id` | Remove a category. |
| PATCH | `/products/categories/:id/restore` | Restore a deleted category. |

### Inventory
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/inventories` | Create an inventory record. |
| GET | `/inventories` | List inventory items for the user's branch. |
| GET | `/inventories/product/:productId` | Get inventory for a specific product. |
| GET | `/inventories/branch/:branchId` | Get inventory for a specific branch. |
| GET | `/inventories/low-stock` | List items with low stock. |
| GET | `/inventories/stats` | Get inventory statistics (Total, Low Stock, Value). |
| GET | `/inventories/:id` | Get details of an inventory record. |
| PUT | `/inventories/:id` | Update inventory balance. |
| DELETE | `/inventories/:id` | Remove an inventory record. |

### Inventory Movements
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/inventory-movements` | Create a new movement (In/Out). |
| POST | `/inventory-movements/transfer` | Initiate an inventory transfer. |
| POST | `/inventory-movements/transfer/:referenceId/complete` | Complete an inventory transfer. |
| GET | `/inventory-movements` | List all movements. |
| GET | `/inventory-movements/stats` | Get movement statistics. |
| PATCH | `/inventory-movements/:id/complete` | Mark a movement as completed. |
| PATCH | `/inventory-movements/:id/cancel` | Cancel a movement. |

### Inventory Transfers
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/inventory-transfers` | Record a new transfer between branches. |
| GET | `/inventory-transfers` | List transfers with filters (Status, Date, Branch). |
| GET | `/inventory-transfers/:id` | Get details of a specific transfer. |
| PATCH | `/inventory-transfers/:id/status` | Update the status of a transfer. |

### Products
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/products` | Create a new product with an optional image. |
| GET | `/products` | List all products. |
| GET | `/products/search` | Search products by name, SKU, or description. |
| GET | `/products/top-selling` | Get top-selling products. |
| GET | `/products/sku/:sku` | Find a product by SKU. |
| GET | `/products/barcode/:barcode` | Find a product by barcode. |
| GET | `/products/:id` | Get details of a specific product. |
| PUT | `/products/:id` | Update product information. |
| PUT | `/products/:id/image` | Update product image. |
| DELETE | `/products/:id` | Remove a product. |
| PATCH | `/products/:id/restore` | Restore a deleted product. |

### Units
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/units` | Create a new measurement unit. |
| GET | `/units` | List all units. |
| GET | `/units/:id` | Get details of a unit. |
| PUT | `/units/:id` | Update a unit. |
| DELETE | `/units/:id` | Remove a unit. |

---

## Purchases Module
Endpoints for managing supplier purchases and payments.

### Suppliers
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/suppliers` | Create a new supplier. |
| GET | `/suppliers` | List all suppliers. |
| GET | `/suppliers/search` | Search suppliers. |
| GET | `/suppliers/stats` | Get supplier statistics. |
| GET | `/suppliers/nit/:nit` | Find supplier by NIT. |
| GET | `/suppliers/:id` | Get details of a specific supplier. |
| PUT | `/suppliers/:id` | Update supplier info. |
| DELETE | `/suppliers/:id` | Remove a supplier. |
| PATCH | `/suppliers/:id/restore` | Restore a deleted supplier. |

### Purchases
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET | `/purchases/next-number` | Get the next sequential invoice number. |
| POST | `/purchases` | Create a new purchase order. |
| GET | `/purchases` | List all purchases. |
| GET | `/purchases/stats` | Get purchase statistics (Pending, Paid, Amount). |
| GET | `/purchases/:id` | Get purchase details. |
| PUT | `/purchases/:id` | Update a purchase. |
| POST | `/purchases/:id/cancel` | Cancel a purchase. |
| POST | `/purchases/:id/receive/:branchId` | Mark a purchase as received into stock. |

### Purchase Payments
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/purchase-payments` | Record a payment for a purchase. |
| GET | `/purchase-payments` | List all purchase payments. |
| GET | `/purchase-payments/purchase/:purchaseId` | Get payments for a specific purchase. |
| GET | `/purchase-payments/stats` | Get payment statistics. |
| POST | `/purchase-payments/:id/cancel` | Cancel a payment. |

### Payment Methods
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/payment-methods` | Create a payment method. |
| GET | `/payment-methods` | List all payment methods. |
| GET | `/payment-methods/code/:code` | Find method by code. |
| PUT | `/payment-methods/:id` | Update a payment method. |

---

## Reports Module
Analytical endpoints for business intelligence.

### Unified Reports
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET | `/reports/dashboard` | Get a comprehensive dashboard dataset. |
| GET | `/reports/sales/trends` | Get historical sales trends. |
| GET | `/reports/products/performance` | Get product performance metrics (Top/Least selling). |
| GET | `/reports/categories/sales` | Get sales breakdown by category. |
| GET | `/reports/branches/performance` | Compare performance between branches. |
| GET | `/reports/inventory/critical-stock` | Get report of products near zero stock. |
| GET | `/reports/sales/hourly` | Get sales distribution by hour of day. |
| GET | `/reports/inventory/waste/trends` | Get inventory waste trends. |
| GET | `/reports/inventory/waste/products` | Get products with highest waste. |
| GET | `/reports/dashboard/calendar` | Get a calendar view of pending payments. |
| GET | `/reports/branches/weekly-consolidation` | Weekly sales consolidation by branch. |
| GET | `/reports/products/monthly-trends` | Monthly sales trends for top products. |

### Orders Report
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET | `/reports/orders/summary` | Get summary of sales order statuses and totals. |

---

## Sales Module
Endpoints for the Point of Sale process.

### Customers
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/customers` | Create a new customer. |
| GET | `/customers` | List all customers. |
| GET | `/customers/search` | Search customers. |
| GET | `/customers/top` | Get top customers by loyalty/purchases. |
| GET | `/customers/stats` | Get customer base statistics. |
| PUT | `/customers/:id` | Update customer info. |
| POST | `/customers/:id/add-points/:points` | Add loyalty points manually. |

### Discount Codes
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/discount-codes` | Create a promotional discount code. |
| GET | `/discount-codes` | List all discount codes. |
| GET | `/discount-codes/active` | List only active codes. |
| GET | `/discount-codes/validate/:code` | Check if a code is valid for a specific scenario. |
| POST | `/discount-codes/apply/:code` | Apply a discount code to a sale. |
| PATCH | `/discount-codes/:id/toggle-status` | Enable/Disable a discount code. |

### Quotations
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/quotations` | Create a new quotation. |
| GET | `/quotations` | List quotations with search and filters. |
| GET | `/quotations/:id` | Get quotation details. |
| PATCH | `/quotations/:id/status` | Update quotation status. |
| POST | `/quotations/:id/convert` | Convert a quotation into a formal sale order. |

### Sales
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET | `/sales/next-number` | Get the next sequential sale number. |
| POST | `/sales` | Create a new sale order. |
| POST | `/sales/:id/confirm` | Confirm an order (Moves to preparation). |
| POST | `/sales/:id/deliver` | Mark an order as delivered. |
| POST | `/sales/:id/cancel` | Cancel an order. |
| GET | `/sales/table` | Get sale list optimized for table views. |
| GET | `/sales/kanban` | Get sale list grouped for Kanban boards. |
| GET | `/sales/kanban/preparation` | Get worklist for a specific preparation area. |
| GET | `/sales/:id` | Get full details of a sale. |
| PUT | `/sales/:id` | Update sale metadata. |
| PATCH | `/sales/details/:detailId/status` | Update status of a specific item in an order. |
| POST | `/sales/:id/send-email` | Send invoice via email. |

### Sale Payments
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/sale-payment` | Record a full payment. |
| POST | `/sale-payment/partial/:saleId` | Add one or more partial payments to a sale. |
| GET | `/sale-payment/sale/:saleId` | List payments for a specific sale. |
| GET | `/sale-payment/stats` | Get sales payment statistics. |
| POST | `/sale-payment/:id/cancel` | Cancel a recorded payment. |

### Sale Details
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/sale-details/sale/:saleId` | Add an item to an existing sale. |
| GET | `/sale-details/sale/:saleId` | List all items in a sale. |
| GET | `/sale-details/sale/:saleId/stats` | Get statistical summary of a sale's items. |
| GET | `/sale-details/product/:productId/stats` | Get sales statistics for a specific product. |
| PUT | `/sale-details/:id/quantity/:quantity` | Update the quantity of an item in an order. |
| DELETE | `/sale-details/:id` | Remove an item from an order. |
