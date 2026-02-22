# Products Mock API (Persistent)

A mock API server with **real CRUD persistence** - data actually saves and persists between requests.

## Key Difference from Standard Version

| Feature | products-api | products-api-persistent |
|---------|--------------|------------------------|
| POST creates new items | Returns example only | ✅ Actually creates and saves |
| GET shows new items | Always same data | ✅ Shows all created items |
| PUT updates items | Returns example only | ✅ Actually updates |
| DELETE removes items | Returns 204 only | ✅ Actually deletes |
| Data persists | No | ✅ Yes, saved to db.json |

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

Once running, open http://127.0.0.1:3001/ in your browser.

### Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | /products | List all products |
| GET | /products/{id} | Get product by ID |
| POST | /products | **Create product (persists!)** |
| PUT | /products/{id} | **Update product (persists!)** |
| DELETE | /products/{id} | **Delete product (persists!)** |
| GET | /products/search?q=term | Search products |
| POST | /reset | Reset database to original state |

### Try It Out

1. **Create a product:**
   ```bash
   curl -X POST http://127.0.0.1:3001/products \
     -H "Content-Type: application/json" \
     -d '{"name":"My New Product","price":49.99,"category":"Test"}'
   ```

2. **Verify it was created:**
   ```bash
   curl http://127.0.0.1:3001/products
   ```
   You'll see your new product in the list!

3. **Reset to original data:**
   ```bash
   curl -X POST http://127.0.0.1:3001/reset
   ```

## Data Storage

- Data is stored in `db.json`
- Changes are saved immediately
- Original data backed up to `db.original.json`
- Use `POST /reset` to restore original data

## Stopping the Server

**Option 1:** Press `Ctrl+C` in the terminal where the server is running.

**Option 2:** Run the stop script:
- macOS/Linux: `./stop.sh`
- Windows: Double-click `stop.bat`
