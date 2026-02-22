/**
 * Mock API Server with Swagger UI and PERSISTENT Data
 * 
 * This server provides:
 * - Swagger UI at the root (/) for API visualization
 * - OpenAPI spec at /openapi.yaml and /openapi.json
 * - REAL CRUD operations with in-memory persistence via json-server
 * - Data persists during the session and saves to db.json
 * 
 * SECURITY NOTES (For Production):
 * ================================
 * This is a LOCAL DEVELOPMENT server. In production, you would add:
 * 
 * 1. AUTHENTICATION (AuthN):
 *    - JWT token validation middleware
 *    - API key validation
 *    - OAuth 2.0 integration
 * 
 * 2. AUTHORIZATION (AuthZ):
 *    - Role-based access control (RBAC)
 *    - Resource-level permissions
 * 
 * 3. HTTPS/TLS:
 *    - Use https.createServer() with SSL certificates
 * 
 * 4. RATE LIMITING:
 *    - const rateLimit = require('express-rate-limit');
 *    - app.use(rateLimit({ windowMs: 15*60*1000, max: 100 }));
 * 
 * 5. INPUT VALIDATION:
 *    - Validate all request bodies against schemas
 *    - Sanitize inputs to prevent XSS/SQL injection
 */

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const cors = require('cors');
const YAML = require('yamljs');
const path = require('path');
const fs = require('fs');

const app = express();

// Configuration
const CONFIG = {
  SERVER_PORT: 3001,
  HOST: '127.0.0.1'
};

// Load OpenAPI specification
const openapiPath = path.join(__dirname, 'openapi.yaml');
let swaggerDocument;

try {
  swaggerDocument = YAML.load(openapiPath);
  swaggerDocument.servers = [
    { url: `http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}`, description: 'Mock API Server (Persistent)' }
  ];
  console.log('✅ OpenAPI specification loaded successfully');
} catch (error) {
  console.error('❌ Failed to load OpenAPI specification:', error.message);
  process.exit(1);
}

// Load database
const dbPath = path.join(__dirname, 'db.json');
let db;

try {
  const dbContent = fs.readFileSync(dbPath, 'utf8');
  db = JSON.parse(dbContent);
  console.log(`✅ Database loaded: ${db.products.length} products`);
} catch (error) {
  console.error('❌ Failed to load database:', error.message);
  process.exit(1);
}

// Save database to file
function saveDb() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// ============================================================
// Middleware
// ============================================================
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================
// API Routes - REAL CRUD with Persistence
// ============================================================

// GET /products - List all products
app.get('/products', (req, res) => {
  res.json(db.products);
});

// GET /products/search - Search products
app.get('/products/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase();
  const results = db.products.filter(p => 
    p.name.toLowerCase().includes(query) || 
    p.description.toLowerCase().includes(query) ||
    p.category.toLowerCase().includes(query)
  );
  res.json({
    query: req.query.q,
    count: results.length,
    results
  });
});

// GET /products/:id - Get single product
app.get('/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const product = db.products.find(p => p.id === id);
  
  if (!product) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Product with id ${id} not found`
    });
  }
  
  res.json(product);
});

// POST /products - Create new product
app.post('/products', (req, res) => {
  const { name, description, price, category, inStock, quantity, sku } = req.body;
  
  // Validation
  if (!name || price === undefined || !category) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Missing required fields: name, price, category'
    });
  }
  
  // Generate new ID
  const maxId = db.products.reduce((max, p) => Math.max(max, p.id), 0);
  
  const newProduct = {
    id: maxId + 1,
    name,
    description: description || '',
    price: parseFloat(price),
    category,
    inStock: inStock !== undefined ? inStock : true,
    quantity: quantity || 0,
    sku: sku || `PROD-${maxId + 1}`,
    createdAt: new Date().toISOString()
  };
  
  db.products.push(newProduct);
  saveDb();
  
  console.log(`✅ Created product: ${newProduct.id} - ${newProduct.name}`);
  res.status(201).json(newProduct);
});

// PUT /products/:id - Update product
app.put('/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = db.products.findIndex(p => p.id === id);
  
  if (index === -1) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Product with id ${id} not found`
    });
  }
  
  const { name, description, price, category, inStock, quantity, sku } = req.body;
  
  // Update fields
  const updated = {
    ...db.products[index],
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(price !== undefined && { price: parseFloat(price) }),
    ...(category !== undefined && { category }),
    ...(inStock !== undefined && { inStock }),
    ...(quantity !== undefined && { quantity }),
    ...(sku !== undefined && { sku })
  };
  
  db.products[index] = updated;
  saveDb();
  
  console.log(`✅ Updated product: ${id} - ${updated.name}`);
  res.json(updated);
});

// DELETE /products/:id - Delete product
app.delete('/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = db.products.findIndex(p => p.id === id);
  
  if (index === -1) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Product with id ${id} not found`
    });
  }
  
  const deleted = db.products.splice(index, 1)[0];
  saveDb();
  
  console.log(`✅ Deleted product: ${id} - ${deleted.name}`);
  res.status(204).send();
});

// ============================================================
// OpenAPI Spec Endpoints
// ============================================================
app.get('/openapi.json', (req, res) => {
  res.json(swaggerDocument);
});

app.get('/openapi.yaml', (req, res) => {
  res.type('text/yaml');
  res.sendFile(openapiPath);
});

// ============================================================
// Swagger UI
// ============================================================
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { font-size: 2em }
    .swagger-ui .info .title::after { 
      content: " (Persistent)"; 
      color: #49cc90;
      font-size: 0.6em;
    }
  `,
  customSiteTitle: 'Products Mock API - Persistent',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true
  }
};

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));
app.get('/', (req, res) => res.redirect('/docs'));

// ============================================================
// Health Check
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'persistent',
    productCount: db.products.length,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// Reset Endpoint (for testing)
// ============================================================
app.post('/reset', (req, res) => {
  // Reload original database
  try {
    const originalDb = fs.readFileSync(path.join(__dirname, 'db.original.json'), 'utf8');
    db = JSON.parse(originalDb);
    saveDb();
    console.log('🔄 Database reset to original state');
    res.json({ message: 'Database reset to original state', productCount: db.products.length });
  } catch (error) {
    res.status(500).json({ error: 'No backup found. Restart server to reset.' });
  }
});

// ============================================================
// Start Server
// ============================================================
app.listen(CONFIG.SERVER_PORT, CONFIG.HOST, () => {
  // Create backup of original database on first start
  const backupPath = path.join(__dirname, 'db.original.json');
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log('📦 Created database backup: db.original.json');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎉 Mock API Server is running! (PERSISTENT MODE)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  📖 Swagger UI:    http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/`);
  console.log(`  📋 OpenAPI JSON:  http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/openapi.json`);
  console.log(`  🔌 API Endpoint:  http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/products`);
  console.log(`  💚 Health Check:  http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/health`);
  console.log(`  🔄 Reset Data:    POST http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/reset`);
  console.log('');
  console.log('  ⚡ Data PERSISTS between requests and saves to db.json');
  console.log('  🔄 POST /reset to restore original data');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Press Ctrl+C to stop the server');
  console.log('═══════════════════════════════════════════════════════════');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down... Data saved to db.json');
  process.exit(0);
});
