import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import apiV4Router from './routes/api-v4';
import { CONFIG, YEARS, getStats, clearAllData } from './data/generator';

const app = express();
const PORT = parseInt(process.env.PORT || '8444', 10);

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Mock Bearer token validation - accept any token
app.use('/4', (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn(`[AUTH] Missing or invalid Authorization header for ${req.method} ${req.originalUrl}`);
    return res.status(401).json({
      errors: [{ message: 'Missing or invalid Authorization header. Expected: Bearer <token>' }],
    });
  }

  // Accept any token for mock purposes
  next();
});

// Health check endpoints
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mock-tempo-api' });
});

app.get('/health/live', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/health/ready', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Stats endpoint
app.get('/stats', (req: Request, res: Response) => {
  const stats = getStats();

  res.json({
    config: stats.config,
    dataRange: stats.dataRange,
    totals: stats.totals,
    memoryUsage: process.memoryUsage(),
  });
});

// Clear data endpoint
app.delete('/mock/data', (req: Request, res: Response) => {
  console.log('[MOCK] Clearing all created data');
  clearAllData();
  res.json({ message: 'All created data cleared' });
});

// API v4 routes (main Tempo API)
app.use('/4', apiV4Router);

// Legacy path support (some clients use /rest/tempo-timesheets/4/)
app.use('/rest/tempo-timesheets/4', apiV4Router);

// Catch-all for unimplemented endpoints
app.use('/4/*', (req: Request, res: Response) => {
  console.warn(`[WARN] Unimplemented endpoint: ${req.method} ${req.originalUrl}`);
  res.status(501).json({
    errors: [{ message: `Endpoint not implemented in mock: ${req.method} ${req.originalUrl}` }],
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Mock Tempo API',
    version: '1.0.0',
    description: 'Mock Tempo API for development and load testing',
    endpoints: {
      health: '/health',
      stats: '/stats',
      apiV4: '/4/*',
    },
    documentation: 'https://apidocs.tempo.io/',
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    errors: [{ message: err.message || 'Internal server error' }],
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const stats = getStats();

  console.log('='.repeat(70));
  console.log('Mock Tempo API Server - Companion to Mock Jira API');
  console.log('='.repeat(70));
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log('');
  console.log('Configuration:');
  console.log(`  - Data Range: ${CONFIG.START_YEAR} - ${CONFIG.CURRENT_YEAR} (${YEARS.length} years)`);
  console.log(`  - Users: ${CONFIG.NUM_USERS.toLocaleString()} (shared with mock-jira)`);
  console.log(`  - Teams: ${CONFIG.NUM_TEAMS.toLocaleString()}`);
  console.log(`  - Accounts: ${stats.totals.accounts} (${stats.totals.accountBreakdown.workstream} workstream + ${stats.totals.accountBreakdown.project} project + ${stats.totals.accountBreakdown.overhead} overhead)`);
  console.log(`  - Worklogs per issue: ${CONFIG.WORKLOGS_PER_ISSUE_MIN}-${CONFIG.WORKLOGS_PER_ISSUE_MAX}`);
  console.log(`  - Plans per user: ${CONFIG.PLANS_PER_USER_MIN}-${CONFIG.PLANS_PER_USER_MAX}`);
  console.log(`  - Seed: ${CONFIG.SEED}`);
  console.log('');
  console.log('User Consistency:');
  console.log(`  - Uses same seed as mock-jira: ${CONFIG.SEED}`);
  console.log(`  - Same hash function for deterministic generation`);
  console.log(`  - User accountIds match: user-000000 through user-${String(CONFIG.NUM_USERS - 1).padStart(6, '0')}`);
  console.log('');
  console.log('Authentication:');
  console.log('  - Bearer token required for /4/* endpoints');
  console.log('  - Any token value is accepted (mock mode)');
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  /health               - Health check`);
  console.log(`  GET  /stats                - Server statistics`);
  console.log('');
  console.log('  Worklogs:');
  console.log(`  GET  /4/worklogs           - List worklogs (filters: from, to, project[], issue[], user[])`);
  console.log(`  POST /4/worklogs           - Create worklog`);
  console.log(`  GET  /4/worklogs/:id       - Get worklog by ID`);
  console.log(`  PUT  /4/worklogs/:id       - Update worklog`);
  console.log(`  DELETE /4/worklogs/:id     - Delete worklog`);
  console.log('');
  console.log('  Accounts:');
  console.log(`  GET  /4/accounts           - List accounts`);
  console.log(`  POST /4/accounts           - Create account`);
  console.log(`  GET  /4/accounts/:key      - Get account by key`);
  console.log(`  PUT  /4/accounts/:key      - Update account`);
  console.log(`  DELETE /4/accounts/:key    - Delete account`);
  console.log(`  POST /4/accounts/search    - Search accounts`);
  console.log('');
  console.log('  Teams:');
  console.log(`  GET  /4/teams              - List teams`);
  console.log(`  POST /4/teams              - Create team`);
  console.log(`  GET  /4/teams/:id          - Get team by ID`);
  console.log(`  PUT  /4/teams/:id          - Update team`);
  console.log(`  DELETE /4/teams/:id        - Delete team`);
  console.log(`  GET  /4/teams/:id/members  - Get team members`);
  console.log(`  POST /4/teams/:id/members  - Add team member`);
  console.log(`  DELETE /4/teams/:id/members/:memberId - Remove team member`);
  console.log('');
  console.log('  Plans:');
  console.log(`  GET  /4/plans              - List plans`);
  console.log(`  POST /4/plans              - Create plan`);
  console.log(`  GET  /4/plans/:id          - Get plan by ID`);
  console.log(`  PUT  /4/plans/:id          - Update plan`);
  console.log(`  DELETE /4/plans/:id        - Delete plan`);
  console.log('');
  console.log('  Flex Plans:');
  console.log(`  POST /4/flex-plans         - Create flex plan`);
  console.log(`  GET  /4/flex-plans/:id     - Get flex plan by ID`);
  console.log(`  PUT  /4/flex-plans/:id     - Update flex plan`);
  console.log(`  DELETE /4/flex-plans/:id   - Delete flex plan`);
  console.log(`  POST /4/flex-plans/search  - Search flex plans`);
  console.log('');
  console.log('  Reference Data:');
  console.log(`  GET  /4/roles              - Get available team roles`);
  console.log(`  GET  /4/account-categories - Get account categories`);
  console.log(`  GET  /4/users/:accountId   - Get user by account ID`);
  console.log('='.repeat(70));
});
