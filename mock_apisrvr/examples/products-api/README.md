# Products Mock API

A ready-to-run mock API server with sample e-commerce product data.

## Quick Start

### macOS/Linux
```bash
./start.sh
```

### Windows
```
Double-click start.bat
```

## What You Get

Once running, open http://127.0.0.1:3001/ in your browser to see the Swagger UI.

### Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | http://127.0.0.1:3001/products | List all products |
| GET | http://127.0.0.1:3001/products/1 | Get product by ID |
| POST | http://127.0.0.1:3001/products | Create product |
| PUT | http://127.0.0.1:3001/products/1 | Update product |
| DELETE | http://127.0.0.1:3001/products/1 | Delete product |
| GET | http://127.0.0.1:3001/products/search?q=laptop | Search products |

### Sample Product

```json
{
  "id": 1,
  "name": "MacBook Pro 16-inch",
  "description": "Apple M3 Pro chip, 18GB RAM, 512GB SSD",
  "price": 2499.99,
  "category": "Electronics",
  "inStock": true,
  "quantity": 25,
  "sku": "APPLE-MBP16-M3",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## Stopping the Server

**Option 1:** Press `Ctrl+C` in the terminal where the server is running.

**Option 2:** Run the stop script:
- macOS/Linux: `./stop.sh`
- Windows: Double-click `stop.bat`

## Files

| File | Purpose |
|------|---------|
| `start.sh` | One-click start for macOS/Linux |
| `start.bat` | One-click start for Windows |
| `stop.sh` | Stop server for macOS/Linux |
| `stop.bat` | Stop server for Windows |
| `openapi.yaml` | API specification (edit to customize) |
| `server.js` | Server code (no need to modify) |
