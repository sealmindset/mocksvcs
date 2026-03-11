import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import apiV2Router from './routes/api-v2';
import apiV3Router from './routes/api-v3';
import { CONFIG, getTotalCounts, YEARS } from './data/generator';

const app = express();
const PORT = parseInt(process.env.PORT || '8443', 10);

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

// Health check endpoints
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mock-jira-api' });
});

app.get('/health/live', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/health/ready', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Stats endpoint
app.get('/stats', (req: Request, res: Response) => {
  const counts = getTotalCounts();

  res.json({
    config: CONFIG,
    dataRange: {
      startYear: CONFIG.START_YEAR,
      currentYear: CONFIG.CURRENT_YEAR,
      totalYears: YEARS.length,
      years: YEARS,
    },
    totals: {
      projects: counts.totalProjects,
      initiatives: counts.totalInitiatives,
      epics: counts.totalEpics,
      tasks: counts.totalTasks,
      users: counts.totalUsers,
      totalIssues: counts.totalInitiatives + counts.totalEpics + counts.totalTasks,
    },
    yearlyBreakdown: counts.yearlyBreakdown,
    statusDistribution: {
      historical: '70% Done, 15% Cancelled, 10% Carried Forward, 5% Other',
      current: 'Full status distribution',
    },
    multiYearProjects: `${CONFIG.MULTI_YEAR_PERCENTAGE * 100}% of projects span multiple years`,
    memoryUsage: process.memoryUsage(),
  });
});

// API v2 routes (used for project search)
app.use('/rest/api/2', apiV2Router);

// API v3 routes (main API)
app.use('/rest/api/3', apiV3Router);

// Catch-all for unimplemented endpoints
app.use('/rest/*', (req: Request, res: Response) => {
  console.warn(`[WARN] Unimplemented endpoint: ${req.method} ${req.originalUrl}`);
  res.status(501).json({
    errorMessages: [`Endpoint not implemented in mock: ${req.method} ${req.originalUrl}`],
    errors: {},
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Mock Jira API',
    version: '1.0.0',
    description: 'Mock Jira Software API for development and load testing',
    endpoints: {
      health: '/health',
      stats: '/stats',
      apiV2: '/rest/api/2/*',
      apiV3: '/rest/api/3/*',
    },
    documentation: 'https://developer.atlassian.com/cloud/jira/software/rest/intro/',
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    errorMessages: [err.message || 'Internal server error'],
    errors: {},
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const counts = getTotalCounts();

  console.log('='.repeat(70));
  console.log('Mock Jira API Server - 5 Year Historical Data');
  console.log('='.repeat(70));
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log('');
  console.log('Configuration:');
  console.log(`  - Data Range: ${CONFIG.START_YEAR} - ${CONFIG.CURRENT_YEAR} (${YEARS.length} years)`);
  console.log(`  - Base Projects/Year: ${CONFIG.NUM_PROJECTS.toLocaleString()}`);
  console.log(`  - Year Scale Range: ${CONFIG.YEAR_SCALE_MIN * 100}% - ${CONFIG.YEAR_SCALE_MAX * 100}%`);
  console.log(`  - Multi-Year Projects: ${CONFIG.MULTI_YEAR_PERCENTAGE * 100}%`);
  console.log(`  - Epics per project: ${CONFIG.EPICS_PER_PROJECT_MIN}-${CONFIG.EPICS_PER_PROJECT_MAX}`);
  console.log(`  - Tasks per epic: ${CONFIG.TASKS_PER_EPIC_MIN}-${CONFIG.TASKS_PER_EPIC_MAX}`);
  console.log(`  - Users: ${CONFIG.NUM_USERS.toLocaleString()}`);
  console.log(`  - Seed: ${CONFIG.SEED}`);
  console.log('');
  console.log('Yearly Breakdown:');
  console.log('-'.repeat(50));
  for (const yearData of counts.yearlyBreakdown) {
    const isCurrentYear = yearData.year === CONFIG.CURRENT_YEAR;
    const marker = isCurrentYear ? ' (current)' : '';
    console.log(`  ${yearData.year}${marker}: ${yearData.projects.toLocaleString()} projects (${(yearData.scale * 100).toFixed(0)}% scale)`);
  }
  console.log('-'.repeat(50));
  console.log('');
  console.log('Total Data (All Years):');
  console.log(`  - Projects:    ${counts.totalProjects.toLocaleString()}`);
  console.log(`  - Initiatives: ${counts.totalInitiatives.toLocaleString()}`);
  console.log(`  - Epics:       ~${counts.totalEpics.toLocaleString()}`);
  console.log(`  - Tasks:       ~${counts.totalTasks.toLocaleString()}`);
  console.log(`  - Total Issues: ~${(counts.totalInitiatives + counts.totalEpics + counts.totalTasks).toLocaleString()}`);
  console.log('');
  console.log('Status Distribution:');
  console.log('  - Historical (pre-2026): 70% Done, 15% Cancelled, 10% In Progress, 5% Other');
  console.log('  - Current (2026): Full status distribution');
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  /health          - Health check`);
  console.log(`  GET  /stats           - Server statistics with yearly breakdown`);
  console.log(`  GET  /rest/api/3/myself`);
  console.log(`  GET  /rest/api/2/project/search`);
  console.log(`  GET  /rest/api/2/project/:key`);
  console.log(`  GET  /rest/api/3/search/jql`);
  console.log(`  POST /rest/api/3/search`);
  console.log(`  GET  /rest/api/3/issue/:key`);
  console.log(`  PUT  /rest/api/3/issue/:key`);
  console.log(`  POST /rest/api/3/issue`);
  console.log(`  GET  /rest/api/3/user/search`);
  console.log('='.repeat(70));
});
