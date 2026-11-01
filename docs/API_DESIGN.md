# 3Monks - API Design Document

## Base URL
```
http://localhost:8080/api
```

## Authentication
All protected endpoints require a JWT Bearer token in the Authorization header:
```
Authorization: Bearer <token>
```

## Response Format
All API responses follow a standard wrapper:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

Error responses:
```json
{
  "success": false,
  "message": "Error description",
  "data": null
}
```

---

## 1. Authentication API

### POST /api/auth/login
Login and receive JWT token.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "tokenType": "Bearer",
    "userId": 1,
    "username": "admin",
    "fullName": "Super Admin",
    "role": "SUPER_ADMIN",
    "shopId": 1,
    "shopName": "3Monks - Main Branch"
  }
}
```

---

## 2. Public API (No Auth Required)

### GET /api/public/menu
Returns all active products with their fruits.

### GET /api/public/menu/shots
Returns active SHOT products only.

### GET /api/public/menu/blends
Returns active BLEND products only.

### GET /api/public/fruits
Returns all active fruits.

### GET /api/public/shops
Returns all active shops.

---

## 3. Admin API (SUPER_ADMIN only)

### Shops
- `GET /api/admin/shops` — List all shops
- `POST /api/admin/shops` — Create shop
- `PUT /api/admin/shops/{id}` — Update shop
- `PUT /api/admin/shops/{id}/toggle` — Toggle active status

**Create/Update Shop Body:**
```json
{
  "name": "3Monks - Branch 2",
  "address": "123 Main St",
  "phone": "+91 99999 00000",
  "gstNumber": "29ABCDE1234F1ZK"
}
```

### Users
- `GET /api/admin/users` — List all users
- `POST /api/admin/users` — Create user
- `PUT /api/admin/users/{id}/toggle` — Toggle active status

**Create User Body:**
```json
{
  "fullName": "John Doe",
  "username": "john",
  "password": "password123",
  "role": "SHOP_MANAGER",
  "shopId": 1
}
```

### Products
- `GET /api/admin/products` — List all products
- `POST /api/admin/products` — Create product
- `PUT /api/admin/products/{id}` — Update product
- `PUT /api/admin/products/{id}/toggle` — Toggle active status

**Create/Update Product Body:**
```json
{
  "name": "Mango-Banana Blend",
  "category": "BLEND",
  "price": 99.00,
  "description": "Tropical blend",
  "fruitIds": [1, 2]
}
```

### Fruits
- `GET /api/admin/fruits` — List all fruits
- `POST /api/admin/fruits` — Create fruit
- `PUT /api/admin/fruits/{id}` — Update fruit
- `PUT /api/admin/fruits/{id}/toggle` — Toggle active status

### Raw Materials
- `GET /api/admin/raw-materials` — List all raw materials
- `POST /api/admin/raw-materials` — Create raw material
- `PUT /api/admin/raw-materials/{id}` — Update raw material
- `PUT /api/admin/raw-materials/{id}/toggle` — Toggle active status

**Create/Update Raw Material Body:**
```json
{
  "name": "Sugar",
  "unitType": "KG",
  "costPerUnit": 45.00
}
```

---

## 4. Manager API (SUPER_ADMIN + SHOP_MANAGER)

### Stock
- `GET /api/manager/shops/{shopId}/stock` — Get shop stock
- `POST /api/manager/stock` — Add/update stock entry

**Add Stock Body:**
```json
{
  "shopId": 1,
  "rawMaterialId": 1,
  "quantity": 50.0,
  "minimumThreshold": 10.0,
  "notes": "Weekly restock"
}
```

### Purchases
- `GET /api/manager/shops/{shopId}/purchases` — Get shop purchases
- `POST /api/manager/purchases` — Record purchase (auto-adds to stock)

**Record Purchase Body:**
```json
{
  "shopId": 1,
  "rawMaterialId": 1,
  "quantity": 25.0,
  "totalCost": 1125.00,
  "vendorName": "Fresh Farms",
  "invoiceNumber": "INV-2024-001"
}
```

---

## 5. Order API (All Authenticated Users)

### Orders
- `POST /api/orders` — Create order
- `GET /api/orders/{id}` — Get order by ID
- `GET /api/orders/shop/{shopId}` — Get shop orders
- `GET /api/orders/shop/{shopId}/today` — Today's orders
- `GET /api/orders/shop/{shopId}/range?from=&to=` — Date range
- `PUT /api/orders/{id}/cancel` — Cancel order

**Create Order Body:**
```json
{
  "shopId": 1,
  "paymentMode": "CASH",
  "customerName": "John",
  "customerPhone": "9999999999",
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 3, "quantity": 1 }
  ]
}
```

**Order Response:**
```json
{
  "id": 1,
  "orderNumber": "3M-20240101-00001",
  "shopId": 1,
  "shopName": "3Monks - Main Branch",
  "totalAmount": 197.00,
  "paymentMode": "CASH",
  "status": "COMPLETED",
  "items": [...],
  "orderDate": "2024-01-01T10:30:00"
}
```

---

## 6. Dashboard API

### GET /api/dashboard/admin
Admin-level global dashboard with:
- Total sales, orders, cost, profit
- Monthly sales breakdown
- Top 5 products by quantity
- Sales per shop
- Low stock alerts across all shops

### GET /api/dashboard/shop/{shopId}
Shop-level dashboard with same metrics scoped to one shop.

### GET /api/dashboard/profit-loss?shopId=&from=&to=
P&L report for date range:
```json
{
  "shopName": "3Monks - Main Branch",
  "fromDate": "2024-01-01",
  "toDate": "2024-01-31",
  "totalRevenue": 50000.00,
  "totalCost": 20000.00,
  "profit": 30000.00,
  "totalOrders": 500
}
```

### GET /api/dashboard/collection?from=&to=&shopId=
**SUPER_ADMIN only.** Day-end reconciliation: shots and blends sold against the
cash and UPI collected, per branch and per day.

- `from` / `to` default to today; `to` defaults to `from`. The range is capped at 92 days.
- `shopId` is optional and narrows the response to one branch.
- Cash and UPI are counted on every order that was **not cancelled**, PENDING ones
  included, because payment is taken when the order is placed rather than when the
  stations hand it over. (`/admin` and `/profit-loss` count COMPLETED orders only,
  so their totals are deliberately lower.)
- Amounts include the parcel charge, i.e. what the customer actually paid.
- `shots` and `blends` are units sold, not orders: `SHOT` products against
  `CREAMY_BLEND` + `CURATED_BLEND`.
- Cancelled orders are excluded from every figure and reported in `cancelledOrders` /
  `cancelledAmount`.

`branches` carries `shopId`/`shopName`, `days` carries `date`, `totals` carries neither;
every row otherwise has the same shape. Active branches appear even when they sold
nothing, and every day in the range appears even when it is empty.

```json
{
  "fromDate": "2026-11-01",
  "toDate": "2026-11-01",
  "branches": [
    {
      "shopId": 1, "shopName": "3Monks - Main Branch", "date": null,
      "shots": 6, "blends": 4,
      "cashOrders": 2, "upiOrders": 1, "totalOrders": 3,
      "cashAmount": 170.00, "upiAmount": 445.00, "totalAmount": 615.00,
      "cancelledOrders": 1, "cancelledAmount": 40.00
    }
  ],
  "days": [ { "shopId": null, "shopName": null, "date": "2026-11-01", "...": "same fields" } ],
  "totals": { "shopId": null, "shopName": null, "date": null, "...": "same fields" }
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |

## Swagger UI
Interactive API docs available at: `http://localhost:8080/swagger-ui.html`
