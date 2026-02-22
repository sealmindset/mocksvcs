/**
 * Mock API Server with Swagger UI
 * 
 * This server provides:
 * - Swagger UI at the root (/) for API visualization
 * - OpenAPI spec at /openapi.yaml and /openapi.json
 * - Mock API endpoints via Prism proxy
 * 
 * SECURITY NOTES (For Production):
 * ================================
 * This is a LOCAL DEVELOPMENT server. In production, you would add:
 * 
 * 1. AUTHENTICATION (AuthN):
 *    - JWT token validation middleware
 *    - API key validation
 *    - OAuth 2.0 integration
 *    Example: app.use('/api', authMiddleware);
 * 
 * 2. AUTHORIZATION (AuthZ):
 *    - Role-based access control (RBAC)
 *    - Resource-level permissions
 *    Example: app.use('/api/admin', requireRole('admin'));
 * 
 * 3. HTTPS/TLS:
 *    - Use https.createServer() with SSL certificates
 *    - Redirect HTTP to HTTPS
 * 
 * 4. RATE LIMITING:
 *    - const rateLimit = require('express-rate-limit');
 *    - app.use(rateLimit({ windowMs: 15*60*1000, max: 100 }));
 * 
 * 5. HELMET (Security Headers):
 *    - const helmet = require('helmet');
 *    - app.use(helmet());
 * 
 * 6. INPUT VALIDATION:
 *    - Validate all request bodies against schemas
 *    - Sanitize inputs to prevent XSS/SQL injection
 */

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const cors = require('cors');
const YAML = require('yamljs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();

// Configuration
const CONFIG = {
  SERVER_PORT: 3001,
  PRISM_PORT: 4010,
  HOST: '127.0.0.1'
};

// Load OpenAPI specification
const openapiPath = path.join(__dirname, 'openapi.yaml');
let swaggerDocument;

try {
  swaggerDocument = YAML.load(openapiPath);
  // Update server URL to point to this server
  swaggerDocument.servers = [
    { url: `http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}`, description: 'Mock API Server' }
  ];
  console.log('✅ OpenAPI specification loaded successfully');
} catch (error) {
  console.error('❌ Failed to load OpenAPI specification:', error.message);
  process.exit(1);
}

// ============================================================
// SECURITY: CORS Configuration
// ============================================================
// In production, restrict origins:
// const corsOptions = {
//   origin: ['https://yourdomain.com'],
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// };
// app.use(cors(corsOptions));
//
// For local development, we allow all origins:
app.use(cors());

// ============================================================
// SECURITY: Request Logging (Audit Trail)
// ============================================================
// In production, use a proper logging library like winston or pino
// and log to a secure, centralized logging service
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================
// API Proxy to Prism Mock Server (BEFORE any body parsing)
// ============================================================
// Create proxy middleware for /products routes - use filter to only proxy /products paths
const productsProxy = createProxyMiddleware({
  target: `http://${CONFIG.HOST}:${CONFIG.PRISM_PORT}`,
  changeOrigin: true,
  pathFilter: '/products',  // Only proxy requests starting with /products
  on: {
    proxyReq: (proxyReq, req, res) => {
      console.log(`[Proxy] ${req.method} ${req.originalUrl} -> Prism:${CONFIG.PRISM_PORT}`);
    },
    error: (err, req, res) => {
      console.error('Proxy error:', err.message);
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Mock server is not responding',
        detail: 'Ensure Prism is running on port ' + CONFIG.PRISM_PORT
      });
    }
  }
});

// Route all /products requests to Prism (must be before body parsing)
// Use app.use without path so the full URL is preserved
app.use(productsProxy);

// Parse JSON bodies for non-proxied routes
app.use(express.json());

// Serve OpenAPI spec as JSON
app.get('/openapi.json', (req, res) => {
  res.json(swaggerDocument);
});

// Serve OpenAPI spec as YAML
app.get('/openapi.yaml', (req, res) => {
  res.type('text/yaml');
  res.sendFile(openapiPath);
});

// ============================================================
// Swagger UI - API Documentation (at root)
// ============================================================
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { font-size: 2em }
  `,
  customSiteTitle: 'Products Mock API - Swagger UI',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true
  }
};

// Swagger UI at root - MUST be after API routes
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));
app.get('/', (req, res) => res.redirect('/docs'));

// ============================================================
// Health Check Endpoint
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      swagger: '/',
      openapi_json: '/openapi.json',
      openapi_yaml: '/openapi.yaml',
      products: '/products'
    }
  });
});

// ============================================================
// Start Prism Mock Server
// ============================================================
function startPrism() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting Prism mock server...');
    
    const prism = spawn('npx', [
      '@stoplight/prism-cli',
      'mock',
      'openapi.yaml',
      '-h', CONFIG.HOST,
      '-p', CONFIG.PRISM_PORT.toString(),
      '--cors'
    ], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    prism.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Prism is listening')) {
        console.log(`✅ Prism mock server running on port ${CONFIG.PRISM_PORT}`);
        resolve(prism);
      }
      // Log Prism output for debugging
      if (process.env.DEBUG) {
        console.log('[Prism]', output.trim());
      }
    });

    prism.stderr.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('awaiting') && !error.includes('info')) {
        console.error('[Prism Error]', error.trim());
      }
    });

    prism.on('error', (error) => {
      reject(new Error(`Failed to start Prism: ${error.message}`));
    });

    prism.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Prism exited with code ${code}`);
      }
    });

    // Timeout if Prism doesn't start
    setTimeout(() => {
      resolve(prism); // Resolve anyway, proxy will handle errors
    }, 5000);
  });
}

// ============================================================
// Main Startup
// ============================================================
async function main() {
  try {
    // Start Prism first
    const prismProcess = await startPrism();

    // Start Express server
    app.listen(CONFIG.SERVER_PORT, CONFIG.HOST, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('  🎉 Mock API Server is running!');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
      console.log(`  📖 Swagger UI:    http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/`);
      console.log(`  📋 OpenAPI JSON:  http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/openapi.json`);
      console.log(`  📋 OpenAPI YAML:  http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/openapi.yaml`);
      console.log(`  🔌 API Endpoint:  http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/products`);
      console.log(`  💚 Health Check:  http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}/health`);
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('  Press Ctrl+C to stop the server');
      console.log('═══════════════════════════════════════════════════════════');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down...');
      if (prismProcess) {
        prismProcess.kill();
      }
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      if (prismProcess) {
        prismProcess.kill();
      }
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

main();
