import { Router, Request, Response } from 'express';
import {
  searchWorklogs,
  getWorklogById,
  createWorklog,
  updateWorklog,
  deleteWorklog,
  getAccounts,
  getAccountByKeyOrId,
  createAccount,
  updateAccount,
  deleteAccount,
  searchAccounts,
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  generateTeamMembers,
  addTeamMember,
  removeTeamMember,
  searchPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  createFlexPlan,
  getFlexPlanById,
  updateFlexPlan,
  deleteFlexPlan,
  searchFlexPlans,
  generateUser,
  getAllUsers,
  TEAM_ROLES,
  ACCOUNT_CATEGORIES,
  WORKSTREAMS,
  PROJECT_PREFIXES,
  TEAM_DEFINITIONS,
  CONFIG,
} from '../data/generator';

const router = Router();

// ==================== WORKLOGS ====================

/**
 * GET /4/worklogs
 * List worklogs with filters
 */
router.get('/worklogs', (req: Request, res: Response) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const projectKeys = req.query.project ? (Array.isArray(req.query.project) ? req.query.project : [req.query.project]) as string[] : undefined;
  const issueKeys = req.query.issue ? (Array.isArray(req.query.issue) ? req.query.issue : [req.query.issue]) as string[] : undefined;
  const userAccountIds = req.query.user ? (Array.isArray(req.query.user) ? req.query.user : [req.query.user]) as string[] : undefined;
  const accountKeys = req.query.accountKey ? (Array.isArray(req.query.accountKey) ? req.query.accountKey : [req.query.accountKey]) as string[] : undefined;
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);

  console.log(`[API v4] GET /worklogs - from: ${from}, to: ${to}, projects: ${projectKeys}, issues: ${issueKeys}, users: ${userAccountIds}, accounts: ${accountKeys}`);

  const result = searchWorklogs({
    from,
    to,
    projectKeys,
    issueKeys,
    userAccountIds,
    accountKeys,
    offset,
    limit,
  });

  res.json({
    metadata: {
      count: result.worklogs.length,
      offset,
      limit,
      next: offset + limit < result.total ? `/4/worklogs?offset=${offset + limit}&limit=${limit}` : undefined,
    },
    results: result.worklogs,
    self: req.originalUrl,
  });
});

/**
 * POST /4/worklogs
 * Create a worklog
 */
router.post('/worklogs', (req: Request, res: Response) => {
  const { issueKey, timeSpentSeconds, billableSeconds, startDate, startTime, description, authorAccountId, accountKey } = req.body;

  console.log(`[API v4] POST /worklogs - issue: ${issueKey}, author: ${authorAccountId}, account: ${accountKey}`);

  if (!issueKey || !timeSpentSeconds || !startDate || !authorAccountId) {
    return res.status(400).json({
      errors: [{ message: 'issueKey, timeSpentSeconds, startDate, and authorAccountId are required' }],
    });
  }

  const worklog = createWorklog({
    issueKey,
    timeSpentSeconds,
    billableSeconds,
    startDate,
    startTime,
    description,
    authorAccountId,
    accountKey,
  });

  res.status(201).json(worklog);
});

/**
 * GET /4/worklogs/:id
 * Get worklog by ID
 */
router.get('/worklogs/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  console.log(`[API v4] GET /worklogs/${id}`);

  const worklog = getWorklogById(id);

  if (!worklog) {
    return res.status(404).json({
      errors: [{ message: `Worklog with id ${id} not found` }],
    });
  }

  res.json(worklog);
});

/**
 * PUT /4/worklogs/:id
 * Update a worklog
 */
router.put('/worklogs/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  console.log(`[API v4] PUT /worklogs/${id}`);

  const worklog = updateWorklog(id, updates);

  if (!worklog) {
    return res.status(404).json({
      errors: [{ message: `Worklog with id ${id} not found` }],
    });
  }

  res.json(worklog);
});

/**
 * DELETE /4/worklogs/:id
 * Delete a worklog
 */
router.delete('/worklogs/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  console.log(`[API v4] DELETE /worklogs/${id}`);

  const deleted = deleteWorklog(id);

  if (!deleted) {
    return res.status(404).json({
      errors: [{ message: `Worklog with id ${id} not found` }],
    });
  }

  res.status(204).send();
});

// ==================== ACCOUNTS ====================

/**
 * GET /4/accounts
 * List accounts
 */
router.get('/accounts', (req: Request, res: Response) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);

  console.log(`[API v4] GET /accounts - offset: ${offset}, limit: ${limit}`);

  const result = getAccounts(offset, limit);

  res.json({
    metadata: {
      count: result.accounts.length,
      offset,
      limit,
      next: offset + limit < result.total ? `/4/accounts?offset=${offset + limit}&limit=${limit}` : undefined,
    },
    results: result.accounts,
    self: req.originalUrl,
  });
});

/**
 * POST /4/accounts
 * Create an account
 */
router.post('/accounts', (req: Request, res: Response) => {
  const { key, name, status, leadAccountId, contactAccountId, monthlyBudget, global } = req.body;

  console.log(`[API v4] POST /accounts - key: ${key}, name: ${name}`);

  if (!key || !name) {
    return res.status(400).json({
      errors: [{ message: 'key and name are required' }],
    });
  }

  const account = createAccount({
    key,
    name,
    status,
    leadAccountId,
    contactAccountId,
    monthlyBudget,
    global,
  });

  res.status(201).json(account);
});

/**
 * GET /4/accounts/:key
 * Get account by key
 */
router.get('/accounts/:key', (req: Request, res: Response) => {
  const { key } = req.params;

  console.log(`[API v4] GET /accounts/${key}`);

  const account = getAccountByKeyOrId(key);

  if (!account) {
    return res.status(404).json({
      errors: [{ message: `Account with key ${key} not found` }],
    });
  }

  res.json(account);
});

/**
 * PUT /4/accounts/:key
 * Update an account
 */
router.put('/accounts/:key', (req: Request, res: Response) => {
  const { key } = req.params;
  const updates = req.body;

  console.log(`[API v4] PUT /accounts/${key}`);

  const account = updateAccount(key, updates);

  if (!account) {
    return res.status(404).json({
      errors: [{ message: `Account with key ${key} not found` }],
    });
  }

  res.json(account);
});

/**
 * DELETE /4/accounts/:key
 * Delete an account
 */
router.delete('/accounts/:key', (req: Request, res: Response) => {
  const { key } = req.params;

  console.log(`[API v4] DELETE /accounts/${key}`);

  const deleted = deleteAccount(key);

  if (!deleted) {
    return res.status(404).json({
      errors: [{ message: `Account with key ${key} not found` }],
    });
  }

  res.status(204).send();
});

/**
 * POST /4/accounts/search
 * Search accounts
 */
router.post('/accounts/search', (req: Request, res: Response) => {
  const { keys, statuses, leadAccountIds, offset = 0, limit = 50 } = req.body;

  console.log(`[API v4] POST /accounts/search - keys: ${keys}, statuses: ${statuses}`);

  const result = searchAccounts({
    keys,
    statuses,
    leadAccountIds,
    offset,
    limit: Math.min(limit, 1000),
  });

  res.json({
    metadata: {
      count: result.accounts.length,
      offset,
      limit,
    },
    results: result.accounts,
    self: req.originalUrl,
  });
});

// ==================== TEAMS ====================

/**
 * GET /4/teams
 * List teams
 */
router.get('/teams', (req: Request, res: Response) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);

  console.log(`[API v4] GET /teams - offset: ${offset}, limit: ${limit}`);

  const result = getTeams(offset, limit);

  res.json({
    metadata: {
      count: result.teams.length,
      offset,
      limit,
      next: offset + limit < result.total ? `/4/teams?offset=${offset + limit}&limit=${limit}` : undefined,
    },
    results: result.teams,
    self: req.originalUrl,
  });
});

/**
 * POST /4/teams
 * Create a team
 */
router.post('/teams', (req: Request, res: Response) => {
  const { name, summary, leadAccountId } = req.body;

  console.log(`[API v4] POST /teams - name: ${name}`);

  if (!name) {
    return res.status(400).json({
      errors: [{ message: 'name is required' }],
    });
  }

  const team = createTeam({ name, summary, leadAccountId });

  res.status(201).json(team);
});

/**
 * GET /4/teams/:id
 * Get team by ID
 */
router.get('/teams/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  console.log(`[API v4] GET /teams/${id}`);

  const team = getTeamById(id);

  if (!team) {
    return res.status(404).json({
      errors: [{ message: `Team with id ${id} not found` }],
    });
  }

  res.json(team);
});

/**
 * PUT /4/teams/:id
 * Update a team
 */
router.put('/teams/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  console.log(`[API v4] PUT /teams/${id}`);

  const team = updateTeam(id, updates);

  if (!team) {
    return res.status(404).json({
      errors: [{ message: `Team with id ${id} not found` }],
    });
  }

  res.json(team);
});

/**
 * DELETE /4/teams/:id
 * Delete a team
 */
router.delete('/teams/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  console.log(`[API v4] DELETE /teams/${id}`);

  const deleted = deleteTeam(id);

  if (!deleted) {
    return res.status(404).json({
      errors: [{ message: `Team with id ${id} not found` }],
    });
  }

  res.status(204).send();
});

/**
 * GET /4/teams/:id/members
 * Get team members
 */
router.get('/teams/:id/members', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  console.log(`[API v4] GET /teams/${id}/members`);

  const team = getTeamById(id);
  if (!team) {
    return res.status(404).json({
      errors: [{ message: `Team with id ${id} not found` }],
    });
  }

  const members = generateTeamMembers(id);

  res.json({
    metadata: {
      count: members.length,
      offset: 0,
      limit: members.length,
    },
    results: members,
    self: req.originalUrl,
  });
});

/**
 * POST /4/teams/:id/members
 * Add team member
 */
router.post('/teams/:id/members', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { accountId, commitmentPercent, from, to, roleId } = req.body;

  console.log(`[API v4] POST /teams/${id}/members - accountId: ${accountId}`);

  if (!accountId) {
    return res.status(400).json({
      errors: [{ message: 'accountId is required' }],
    });
  }

  const member = addTeamMember(id, { accountId, commitmentPercent, from, to, roleId });

  if (!member) {
    return res.status(404).json({
      errors: [{ message: `Team with id ${id} not found` }],
    });
  }

  res.status(201).json(member);
});

/**
 * DELETE /4/teams/:id/members/:memberId
 * Remove team member
 */
router.delete('/teams/:id/members/:memberId', (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const memberId = parseInt(req.params.memberId);

  console.log(`[API v4] DELETE /teams/${teamId}/members/${memberId}`);

  const deleted = removeTeamMember(teamId, memberId);

  if (!deleted) {
    return res.status(404).json({
      errors: [{ message: `Team member with id ${memberId} not found in team ${teamId}` }],
    });
  }

  res.status(204).send();
});

// ==================== PLANS ====================

/**
 * GET /4/plans
 * List plans
 */
router.get('/plans', (req: Request, res: Response) => {
  const assigneeAccountIds = req.query.assigneeAccountId
    ? (Array.isArray(req.query.assigneeAccountId) ? req.query.assigneeAccountId : [req.query.assigneeAccountId]) as string[]
    : undefined;
  const planItemTypes = req.query.planItemType
    ? (Array.isArray(req.query.planItemType) ? req.query.planItemType : [req.query.planItemType]) as ('ISSUE' | 'PROJECT' | 'ACCOUNT')[]
    : undefined;
  const from = req.query.from as string;
  const to = req.query.to as string;
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);

  console.log(`[API v4] GET /plans - assignees: ${assigneeAccountIds}, from: ${from}, to: ${to}`);

  const result = searchPlans({
    assigneeAccountIds,
    planItemTypes,
    from,
    to,
    offset,
    limit,
  });

  res.json({
    metadata: {
      count: result.plans.length,
      offset,
      limit,
      next: offset + limit < result.total ? `/4/plans?offset=${offset + limit}&limit=${limit}` : undefined,
    },
    results: result.plans,
    self: req.originalUrl,
  });
});

/**
 * POST /4/plans
 * Create a plan
 */
router.post('/plans', (req: Request, res: Response) => {
  const {
    startDate,
    endDate,
    secondsPerDay,
    includeNonWorkingDays,
    description,
    planItemType,
    planItemId,
    assigneeAccountId,
  } = req.body;

  console.log(`[API v4] POST /plans - assignee: ${assigneeAccountId}, type: ${planItemType}`);

  if (!startDate || !endDate || !secondsPerDay || !planItemType || planItemId === undefined || !assigneeAccountId) {
    return res.status(400).json({
      errors: [{ message: 'startDate, endDate, secondsPerDay, planItemType, planItemId, and assigneeAccountId are required' }],
    });
  }

  const plan = createPlan({
    startDate,
    endDate,
    secondsPerDay,
    includeNonWorkingDays,
    description,
    planItemType,
    planItemId,
    assigneeAccountId,
  });

  res.status(201).json(plan);
});

/**
 * GET /4/plans/:id
 * Get plan by ID
 */
router.get('/plans/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  console.log(`[API v4] GET /plans/${id}`);

  const plan = getPlanById(id);

  if (!plan) {
    return res.status(404).json({
      errors: [{ message: `Plan with id ${id} not found` }],
    });
  }

  res.json(plan);
});

/**
 * PUT /4/plans/:id
 * Update a plan
 */
router.put('/plans/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  console.log(`[API v4] PUT /plans/${id}`);

  const plan = updatePlan(id, updates);

  if (!plan) {
    return res.status(404).json({
      errors: [{ message: `Plan with id ${id} not found` }],
    });
  }

  res.json(plan);
});

/**
 * DELETE /4/plans/:id
 * Delete a plan
 */
router.delete('/plans/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  console.log(`[API v4] DELETE /plans/${id}`);

  const deleted = deletePlan(id);

  if (!deleted) {
    return res.status(404).json({
      errors: [{ message: `Plan with id ${id} not found` }],
    });
  }

  res.status(204).send();
});

// ==================== FLEX PLANS ====================

/**
 * POST /4/flex-plans
 * Create a flex plan
 */
router.post('/flex-plans', (req: Request, res: Response) => {
  const {
    teamId,
    planItemType,
    planItemId,
    startDate,
    endDate,
    percentage,
    secondsPerDay,
    description,
  } = req.body;

  console.log(`[API v4] POST /flex-plans - teamId: ${teamId}, type: ${planItemType}`);

  if (!teamId || !planItemType || planItemId === undefined || !startDate || !endDate) {
    return res.status(400).json({
      errors: [{ message: 'teamId, planItemType, planItemId, startDate, and endDate are required' }],
    });
  }

  const flexPlan = createFlexPlan({
    teamId,
    planItemType,
    planItemId,
    startDate,
    endDate,
    percentage,
    secondsPerDay,
    description,
  });

  if (!flexPlan) {
    return res.status(404).json({
      errors: [{ message: `Team with id ${teamId} not found` }],
    });
  }

  res.status(201).json(flexPlan);
});

/**
 * GET /4/flex-plans/:id
 * Get flex plan by ID
 */
router.get('/flex-plans/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  console.log(`[API v4] GET /flex-plans/${id}`);

  const flexPlan = getFlexPlanById(id);

  if (!flexPlan) {
    return res.status(404).json({
      errors: [{ message: `Flex plan with id ${id} not found` }],
    });
  }

  res.json(flexPlan);
});

/**
 * PUT /4/flex-plans/:id
 * Update a flex plan
 */
router.put('/flex-plans/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  console.log(`[API v4] PUT /flex-plans/${id}`);

  const flexPlan = updateFlexPlan(id, updates);

  if (!flexPlan) {
    return res.status(404).json({
      errors: [{ message: `Flex plan with id ${id} not found` }],
    });
  }

  res.json(flexPlan);
});

/**
 * DELETE /4/flex-plans/:id
 * Delete a flex plan
 */
router.delete('/flex-plans/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  console.log(`[API v4] DELETE /flex-plans/${id}`);

  const deleted = deleteFlexPlan(id);

  if (!deleted) {
    return res.status(404).json({
      errors: [{ message: `Flex plan with id ${id} not found` }],
    });
  }

  res.status(204).send();
});

/**
 * POST /4/flex-plans/search
 * Search flex plans
 */
router.post('/flex-plans/search', (req: Request, res: Response) => {
  const { teamIds, planItemTypes, from, to, offset = 0, limit = 50 } = req.body;

  console.log(`[API v4] POST /flex-plans/search - teamIds: ${teamIds}`);

  const result = searchFlexPlans({
    teamIds,
    planItemTypes,
    from,
    to,
    offset,
    limit: Math.min(limit, 1000),
  });

  res.json({
    metadata: {
      count: result.flexPlans.length,
      offset,
      limit,
    },
    results: result.flexPlans,
    self: req.originalUrl,
  });
});

// ==================== REFERENCE DATA ====================

/**
 * GET /4/roles
 * Get available team roles
 */
router.get('/roles', (req: Request, res: Response) => {
  console.log('[API v4] GET /roles');

  res.json({
    metadata: {
      count: TEAM_ROLES.length,
      offset: 0,
      limit: TEAM_ROLES.length,
    },
    results: TEAM_ROLES,
    self: req.originalUrl,
  });
});

/**
 * GET /4/account-categories
 * Get available account categories
 */
router.get('/account-categories', (req: Request, res: Response) => {
  console.log('[API v4] GET /account-categories');

  res.json({
    metadata: {
      count: ACCOUNT_CATEGORIES.length,
      offset: 0,
      limit: ACCOUNT_CATEGORIES.length,
    },
    results: ACCOUNT_CATEGORIES,
    self: req.originalUrl,
  });
});

/**
 * GET /4/users/:accountId
 * Get user by account ID
 */
router.get('/users/:accountId', (req: Request, res: Response) => {
  const { accountId } = req.params;

  console.log(`[API v4] GET /users/${accountId}`);

  const userIndex = parseInt(accountId.replace('user-', ''));

  if (isNaN(userIndex) || userIndex < 0 || userIndex >= CONFIG.NUM_USERS) {
    return res.status(404).json({
      errors: [{ message: `User with accountId ${accountId} not found` }],
    });
  }

  const user = generateUser(userIndex);
  res.json(user);
});

/**
 * GET /4/users
 * List all users (paginated)
 */
router.get('/users', (req: Request, res: Response) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

  console.log(`[API v4] GET /users - offset: ${offset}, limit: ${limit}`);

  const allUsers = getAllUsers();
  const paginated = allUsers.slice(offset, offset + limit);

  res.json({
    metadata: {
      count: paginated.length,
      offset,
      limit,
      total: allUsers.length,
      next: offset + limit < allUsers.length ? `/4/users?offset=${offset + limit}&limit=${limit}` : undefined,
    },
    results: paginated,
    self: req.originalUrl,
  });
});

/**
 * GET /4/workstreams
 * Get available workstreams (aligns with Jira custom field)
 */
router.get('/workstreams', (req: Request, res: Response) => {
  console.log('[API v4] GET /workstreams');

  const workstreams = WORKSTREAMS.map((name, index) => ({
    id: index + 1,
    name,
    key: `WS-${name.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20).toUpperCase()}`,
  }));

  res.json({
    metadata: {
      count: workstreams.length,
      offset: 0,
      limit: workstreams.length,
    },
    results: workstreams,
    self: req.originalUrl,
  });
});

/**
 * GET /4/project-prefixes
 * Get available project prefixes (aligns with Jira projects)
 */
router.get('/project-prefixes', (req: Request, res: Response) => {
  console.log('[API v4] GET /project-prefixes');

  const prefixes = PROJECT_PREFIXES.map((prefix, index) => ({
    id: index + 1,
    key: prefix,
    accountKey: `PROJ-${prefix}`,
  }));

  res.json({
    metadata: {
      count: prefixes.length,
      offset: 0,
      limit: prefixes.length,
    },
    results: prefixes,
    self: req.originalUrl,
  });
});

/**
 * GET /4/team-definitions
 * Get team definitions with project alignment
 */
router.get('/team-definitions', (req: Request, res: Response) => {
  console.log('[API v4] GET /team-definitions');

  const definitions = TEAM_DEFINITIONS.map((def, index) => ({
    id: index + 1,
    name: def.name,
    summary: def.summary,
    alignedPrefixes: def.prefixes,
  }));

  res.json({
    metadata: {
      count: definitions.length,
      offset: 0,
      limit: definitions.length,
    },
    results: definitions,
    self: req.originalUrl,
  });
});

export default router;
