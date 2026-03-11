import { Router, Request, Response } from 'express';
import {
  generateUser,
  searchIssues,
  getIssueByKey,
  searchUsers,
  getTransitions,
  getFieldMetadata,
  CONFIG,
  ISSUE_TYPES,
  WORKSTREAMS,
  HEALTH_STATUSES,
  CAPITAL_EXPENSE_OPTIONS,
  STATUSES,
  PRIORITIES,
} from '../data/generator';
import {
  getIssueUpdates,
  setIssueUpdates,
  storeCreatedIssue,
  getCreatedIssue,
  getPersistenceStats,
  clearAllData,
} from '../data/persistence';
import {
  ROLE_TEMPLATES,
  getRoleRequirements,
  getRoleRequirement,
  createRoleRequirement,
  updateRoleRequirement,
  deleteRoleRequirement,
  getAssignmentsForIssue,
  getAssignmentsForRole,
  getAssignmentsForUser,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getIssueRoleData,
  getUserTotalAllocation,
  getRoleAssignmentStats,
} from '../data/role-assignments';
import { JiraTransition } from '../types/jira';

const router = Router();

/**
 * GET /rest/api/3/myself
 * Get current user (mock)
 */
router.get('/myself', (req: Request, res: Response) => {
  console.log('[API v3] GET /myself');

  const mockUser = generateUser(0);
  mockUser.displayName = 'Mock API User';
  mockUser.emailAddress = 'mock.user@company.com';

  res.json(mockUser);
});

/**
 * GET /rest/api/3/search/jql
 * Search issues using JQL (GET method)
 */
router.get('/search/jql', (req: Request, res: Response) => {
  const jql = req.query.jql as string || '';
  const startAt = parseInt(req.query.startAt as string) || 0;
  const maxResults = parseInt(req.query.maxResults as string) || 50;
  const fields = (req.query.fields as string)?.split(',') || [];

  console.log(`[API v3] GET /search/jql - jql: "${jql}", startAt: ${startAt}, maxResults: ${maxResults}`);

  // Parse JQL to extract project and issue types
  const projectMatch = jql.match(/project\s*=\s*(\w+)/i);
  const projectKey = projectMatch ? projectMatch[1] : undefined;

  const issueTypeMatch = jql.match(/issuetype\s+in\s+\(([^)]+)\)/i) || jql.match(/issuetype\s*=\s*(\d+)/i);
  let issueTypes: string[] | undefined;

  if (issueTypeMatch) {
    issueTypes = issueTypeMatch[1].split(',').map((t: string) => t.trim());
  }

  const result = searchIssues({
    projectKey,
    issueTypes,
    startAt,
    maxResults,
  });

  // Apply any stored updates to issues
  const issues = result.issues.map(issue => {
    const updates = getIssueUpdates(issue.key);
    if (updates) {
      return {
        ...issue,
        fields: { ...issue.fields, ...updates },
      };
    }
    return issue;
  });

  res.json({
    startAt,
    maxResults,
    total: result.total,
    issues,
  });
});

/**
 * POST /rest/api/3/search
 * Search issues using JQL (POST method)
 */
router.post('/search', (req: Request, res: Response) => {
  const { jql = '', startAt = 0, maxResults = 50, fields = [] } = req.body;

  console.log(`[API v3] POST /search - jql: "${jql}", startAt: ${startAt}, maxResults: ${maxResults}`);

  // Parse JQL to extract project and issue types
  const projectMatch = jql.match(/project\s*=\s*(\w+)/i);
  const projectKey = projectMatch ? projectMatch[1] : undefined;

  const issueTypeMatch = jql.match(/issuetype\s+in\s+\(([^)]+)\)/i) || jql.match(/issuetype\s*=\s*(\d+)/i);
  let issueTypes: string[] | undefined;

  if (issueTypeMatch) {
    issueTypes = issueTypeMatch[1].split(',').map((t: string) => t.trim());
  }

  const result = searchIssues({
    projectKey,
    issueTypes,
    startAt,
    maxResults,
  });

  // Apply any stored updates to issues
  const issues = result.issues.map(issue => {
    const updates = getIssueUpdates(issue.key);
    if (updates) {
      return {
        ...issue,
        fields: { ...issue.fields, ...updates },
      };
    }
    return issue;
  });

  res.json({
    startAt,
    maxResults,
    total: result.total,
    issues,
  });
});

/**
 * GET /rest/api/3/issue/createmeta
 * Get create metadata for issues
 * NOTE: This route MUST be defined before /issue/:issueKey to avoid being caught by the wildcard
 */
router.get('/issue/createmeta', (req: Request, res: Response) => {
  const projectKeys = (req.query.projectKeys as string)?.split(',') || [];
  const issuetypeIds = (req.query.issuetypeIds as string)?.split(',') || [];
  const expand = (req.query.expand as string) || '';

  console.log(`[API v3] GET /issue/createmeta - projectKeys: ${projectKeys}, issuetypeIds: ${issuetypeIds}`);

  if (projectKeys.length === 0) {
    return res.json({ projects: [] });
  }

  const metadata = getFieldMetadata(projectKeys[0]);

  if (!metadata) {
    return res.json({ projects: [] });
  }

  res.json(metadata);
});

/**
 * GET /rest/api/3/issue/:issueKey
 * Get issue by key
 */
router.get('/issue/:issueKey', (req: Request, res: Response) => {
  const { issueKey } = req.params;

  console.log(`[API v3] GET /issue/${issueKey}`);

  // Check if it's a created issue first
  const createdIssue = getCreatedIssue(issueKey);
  if (createdIssue) {
    return res.json({
      id: createdIssue.id || issueKey.split('-')[1],
      key: issueKey,
      self: `/rest/api/3/issue/${issueKey}`,
      fields: createdIssue,
    });
  }

  const issue = getIssueByKey(issueKey);

  if (!issue) {
    return res.status(404).json({
      errorMessages: [`Issue does not exist or you do not have permission to see it.`],
      errors: {},
    });
  }

  // Apply any stored updates
  const updates = getIssueUpdates(issueKey);
  if (updates) {
    issue.fields = { ...issue.fields, ...updates };
  }

  res.json(issue);
});

/**
 * POST /rest/api/3/issue
 * Create a new issue
 */
router.post('/issue', (req: Request, res: Response) => {
  const { fields } = req.body;

  console.log(`[API v3] POST /issue - creating new issue`);
  console.log(`[API v3] Fields:`, JSON.stringify(fields, null, 2));

  // Generate a mock issue key
  const projectKey = fields?.project?.key || 'MOCK';
  const issueNum = Math.floor(Math.random() * 100000) + 50000;
  const issueKey = `${projectKey}-${issueNum}`;

  // Store the created issue with persistence
  storeCreatedIssue(issueKey, {
    ...fields,
    id: String(issueNum),
  });

  console.log(`[API v3] Created issue ${issueKey}`);

  res.status(201).json({
    id: String(issueNum),
    key: issueKey,
    self: `/rest/api/3/issue/${issueKey}`,
  });
});

/**
 * PUT /rest/api/3/issue/:issueKey
 * Update an issue
 */
router.put('/issue/:issueKey', (req: Request, res: Response) => {
  const { issueKey } = req.params;
  const { fields } = req.body;

  console.log(`[API v3] PUT /issue/${issueKey} - updating fields:`, Object.keys(fields || {}));
  console.log(`[API v3] Field values:`, JSON.stringify(fields, null, 2));

  // Check if it's a created issue
  const createdIssue = getCreatedIssue(issueKey);
  if (createdIssue) {
    // Update created issue
    storeCreatedIssue(issueKey, { ...createdIssue, ...fields, updated: new Date().toISOString() });
    console.log(`[API v3] Updated created issue ${issueKey}`);
    return res.status(204).send();
  }

  // Verify generated issue exists
  const issue = getIssueByKey(issueKey);
  if (!issue) {
    return res.status(404).json({
      errorMessages: [`Issue does not exist or you do not have permission to see it.`],
      errors: {},
    });
  }

  // Store the updates with persistence
  setIssueUpdates(issueKey, fields);
  console.log(`[API v3] Updated issue ${issueKey}`);

  // Return 204 No Content as per Jira API spec
  res.status(204).send();
});

/**
 * GET /rest/api/3/user/search
 * Search users
 */
router.get('/user/search', (req: Request, res: Response) => {
  const query = (req.query.query as string) || '';
  const maxResults = Math.min(parseInt(req.query.maxResults as string) || 50, 1000);

  console.log(`[API v3] GET /user/search - query: "${query}", maxResults: ${maxResults}`);

  const users = searchUsers(query, maxResults);

  res.json(users);
});

/**
 * GET /rest/api/3/user/assignable/search
 * Get assignable users for a project
 */
router.get('/user/assignable/search', (req: Request, res: Response) => {
  const project = req.query.project as string;
  const maxResults = Math.min(parseInt(req.query.maxResults as string) || 50, 1000);

  console.log(`[API v3] GET /user/assignable/search - project: ${project}, maxResults: ${maxResults}`);

  // Return all users as assignable for mock purposes
  const users = searchUsers('', maxResults);

  res.json(users);
});

/**
 * GET /rest/api/3/issue/:issueKey/transitions
 * Get available transitions for an issue
 */
router.get('/issue/:issueKey/transitions', (req: Request, res: Response) => {
  const { issueKey } = req.params;

  console.log(`[API v3] GET /issue/${issueKey}/transitions`);

  const transitions = getTransitions(issueKey);

  if (transitions.length === 0) {
    return res.status(404).json({
      errorMessages: [`Issue does not exist or you do not have permission to see it.`],
      errors: {},
    });
  }

  res.json({ transitions });
});

/**
 * POST /rest/api/3/issue/:issueKey/transitions
 * Transition an issue to a new status
 */
router.post('/issue/:issueKey/transitions', (req: Request, res: Response) => {
  const { issueKey } = req.params;
  const { transition, fields } = req.body;

  console.log(`[API v3] POST /issue/${issueKey}/transitions - transition: ${transition?.id}`);

  // Verify issue exists
  const issue = getIssueByKey(issueKey);
  if (!issue) {
    return res.status(404).json({
      errorMessages: [`Issue does not exist or you do not have permission to see it.`],
      errors: {},
    });
  }

  // Get available transitions
  const availableTransitions = getTransitions(issueKey);
  const targetTransition = availableTransitions.find((t: JiraTransition) => t.id === transition?.id);

  if (!targetTransition) {
    return res.status(400).json({
      errorMessages: [`Invalid transition.`],
      errors: {},
    });
  }

  // Store the status update with persistence
  setIssueUpdates(issueKey, {
    status: targetTransition.to,
    ...fields,
  });

  console.log(`[API v3] Transitioned issue ${issueKey} to ${targetTransition.to.name}`);

  // Return 204 No Content as per Jira API spec
  res.status(204).send();
});

/**
 * GET /rest/api/3/field
 * Get all fields
 */
router.get('/field', (req: Request, res: Response) => {
  console.log('[API v3] GET /field');

  const fields = [
    { id: 'summary', name: 'Summary', custom: false, schema: { type: 'string' } },
    { id: 'description', name: 'Description', custom: false, schema: { type: 'string' } },
    { id: 'status', name: 'Status', custom: false, schema: { type: 'status' } },
    { id: 'priority', name: 'Priority', custom: false, schema: { type: 'priority' } },
    { id: 'assignee', name: 'Assignee', custom: false, schema: { type: 'user' } },
    { id: 'reporter', name: 'Reporter', custom: false, schema: { type: 'user' } },
    { id: 'customfield_10000', name: 'IT Owner(s)', custom: true, schema: { type: 'array', items: 'user' } },
    { id: 'customfield_10078', name: 'Business Champion', custom: true, schema: { type: 'array', items: 'user' } },
    { id: 'customfield_10447', name: 'Workstream', custom: true, schema: { type: 'option' } },
    { id: 'customfield_10121', name: 'In-service Date', custom: true, schema: { type: 'date' } },
    { id: 'customfield_10015', name: 'Start Date', custom: true, schema: { type: 'date' } },
    { id: 'customfield_10685', name: 'End Date', custom: true, schema: { type: 'date' } },
    { id: 'customfield_10132', name: 'PAR #', custom: true, schema: { type: 'string' } },
    { id: 'customfield_10451', name: 'Health Status', custom: true, schema: { type: 'option' } },
    { id: 'customfield_10200', name: 'Business Value', custom: true, schema: { type: 'string' } },
    { id: 'customfield_10450', name: 'Capital/Expense', custom: true, schema: { type: 'option' } },
  ];

  res.json(fields);
});

/**
 * GET /rest/api/3/issuetype
 * Get all issue types
 */
router.get('/issuetype', (req: Request, res: Response) => {
  console.log('[API v3] GET /issuetype');

  res.json(ISSUE_TYPES);
});

/**
 * GET /rest/api/3/serverInfo
 * Get server info
 */
router.get('/serverInfo', (req: Request, res: Response) => {
  console.log('[API v3] GET /serverInfo');

  res.json({
    baseUrl: 'http://localhost:8443',
    version: '9.0.0',
    versionNumbers: [9, 0, 0],
    deploymentType: 'Cloud',
    buildNumber: 100000,
    buildDate: '2024-01-01T00:00:00.000+0000',
    serverTime: new Date().toISOString(),
    scmInfo: 'mock-jira-api',
    serverTitle: 'Mock Jira API for Capacity Planner',
  });
});

/**
 * GET /rest/api/3/field/:fieldId/option
 * Get available options for a field
 */
router.get('/field/:fieldId/option', (req: Request, res: Response) => {
  const { fieldId } = req.params;

  console.log(`[API v3] GET /field/${fieldId}/option`);

  let options: { value: string; id?: string }[] = [];

  switch (fieldId) {
    case 'customfield_10447': // Workstream
      options = WORKSTREAMS.map((w, i) => ({ id: String(i + 1), value: w }));
      break;
    case 'customfield_10451': // Health Status
      options = HEALTH_STATUSES.map((h, i) => ({ id: String(i + 1), value: h }));
      break;
    case 'customfield_10450': // Capital/Expense
      options = CAPITAL_EXPENSE_OPTIONS.map((c, i) => ({ id: String(i + 1), value: c }));
      break;
    default:
      return res.status(404).json({
        errorMessages: [`Field ${fieldId} not found or has no options.`],
        errors: {},
      });
  }

  res.json({
    values: options,
    total: options.length,
  });
});

/**
 * GET /rest/api/3/status
 * Get all available statuses
 */
router.get('/status', (req: Request, res: Response) => {
  console.log('[API v3] GET /status');
  res.json(STATUSES);
});

/**
 * GET /rest/api/3/priority
 * Get all available priorities
 */
router.get('/priority', (req: Request, res: Response) => {
  console.log('[API v3] GET /priority');
  res.json(PRIORITIES);
});

/**
 * GET /rest/api/3/mock/options
 * Custom endpoint to get all available options for custom fields
 * This is useful for the frontend to populate dropdowns
 */
router.get('/mock/options', (req: Request, res: Response) => {
  console.log('[API v3] GET /mock/options');

  res.json({
    workstreams: WORKSTREAMS,
    healthStatuses: HEALTH_STATUSES,
    capitalExpenseOptions: CAPITAL_EXPENSE_OPTIONS,
    statuses: STATUSES.map(s => ({ id: s.id, name: s.name, category: s.statusCategory.name })),
    priorities: PRIORITIES.map(p => ({ id: p.id, name: p.name })),
    issueTypes: ISSUE_TYPES.map(t => ({ id: t.id, name: t.name })),
  });
});

/**
 * GET /rest/api/3/mock/persistence
 * Custom endpoint to get persistence statistics
 */
router.get('/mock/persistence', (req: Request, res: Response) => {
  console.log('[API v3] GET /mock/persistence');
  res.json(getPersistenceStats());
});

/**
 * DELETE /rest/api/3/mock/persistence
 * Custom endpoint to clear all persisted data
 */
router.delete('/mock/persistence', (req: Request, res: Response) => {
  console.log('[API v3] DELETE /mock/persistence - clearing all data');
  clearAllData();
  res.json({ message: 'All persisted data cleared' });
});

// ==================== ROLE ASSIGNMENT ENDPOINTS ====================

/**
 * GET /rest/api/3/mock/roles/templates
 * Get predefined role templates
 */
router.get('/mock/roles/templates', (req: Request, res: Response) => {
  console.log('[API v3] GET /mock/roles/templates');
  res.json({ templates: ROLE_TEMPLATES });
});

/**
 * GET /rest/api/3/mock/roles/stats
 * Get role assignment statistics
 */
router.get('/mock/roles/stats', (req: Request, res: Response) => {
  console.log('[API v3] GET /mock/roles/stats');
  res.json(getRoleAssignmentStats());
});

/**
 * GET /rest/api/3/issue/:issueKey/roles
 * Get all role requirements and assignments for an issue
 */
router.get('/issue/:issueKey/roles', (req: Request, res: Response) => {
  const { issueKey } = req.params;

  console.log(`[API v3] GET /issue/${issueKey}/roles`);

  const roleData = getIssueRoleData(issueKey);
  res.json(roleData);
});

/**
 * POST /rest/api/3/issue/:issueKey/roles
 * Create a new role requirement for an issue
 */
router.post('/issue/:issueKey/roles', (req: Request, res: Response) => {
  const { issueKey } = req.params;
  const { roleName, description, requiredSkills, estimatedHours, priority } = req.body;

  console.log(`[API v3] POST /issue/${issueKey}/roles - roleName: ${roleName}`);

  if (!roleName) {
    return res.status(400).json({
      errorMessages: ['roleName is required'],
      errors: { roleName: 'required' },
    });
  }

  const requirement = createRoleRequirement(issueKey, roleName, {
    description,
    requiredSkills,
    estimatedHours,
    priority,
  });

  res.status(201).json(requirement);
});

/**
 * PUT /rest/api/3/issue/:issueKey/roles/:roleId
 * Update a role requirement
 */
router.put('/issue/:issueKey/roles/:roleId', (req: Request, res: Response) => {
  const { issueKey, roleId } = req.params;
  const updates = req.body;

  console.log(`[API v3] PUT /issue/${issueKey}/roles/${roleId}`);

  const updated = updateRoleRequirement(roleId, updates);

  if (!updated) {
    return res.status(404).json({
      errorMessages: [`Role requirement ${roleId} not found`],
      errors: {},
    });
  }

  res.json(updated);
});

/**
 * DELETE /rest/api/3/issue/:issueKey/roles/:roleId
 * Delete a role requirement (and its assignments)
 */
router.delete('/issue/:issueKey/roles/:roleId', (req: Request, res: Response) => {
  const { issueKey, roleId } = req.params;

  console.log(`[API v3] DELETE /issue/${issueKey}/roles/${roleId}`);

  const deleted = deleteRoleRequirement(roleId);

  if (!deleted) {
    return res.status(404).json({
      errorMessages: [`Role requirement ${roleId} not found`],
      errors: {},
    });
  }

  res.status(204).send();
});

/**
 * GET /rest/api/3/issue/:issueKey/roles/:roleId/assignments
 * Get all assignments for a specific role requirement
 */
router.get('/issue/:issueKey/roles/:roleId/assignments', (req: Request, res: Response) => {
  const { issueKey, roleId } = req.params;

  console.log(`[API v3] GET /issue/${issueKey}/roles/${roleId}/assignments`);

  const requirement = getRoleRequirement(roleId);
  if (!requirement) {
    return res.status(404).json({
      errorMessages: [`Role requirement ${roleId} not found`],
      errors: {},
    });
  }

  const assignments = getAssignmentsForRole(roleId);
  res.json({ assignments });
});

/**
 * POST /rest/api/3/issue/:issueKey/roles/:roleId/assignments
 * Create a new assignment for a role requirement
 */
router.post('/issue/:issueKey/roles/:roleId/assignments', (req: Request, res: Response) => {
  const { issueKey, roleId } = req.params;
  const { userId, userName, userEmail, startDate, endDate, percentage, status, notes } = req.body;

  console.log(`[API v3] POST /issue/${issueKey}/roles/${roleId}/assignments - user: ${userName}`);

  if (!userId || !userName || !startDate || !endDate || percentage === undefined) {
    return res.status(400).json({
      errorMessages: ['userId, userName, startDate, endDate, and percentage are required'],
      errors: {},
    });
  }

  const assignment = createAssignment(roleId, userId, userName, startDate, endDate, percentage, {
    userEmail,
    status,
    notes,
  });

  if (!assignment) {
    return res.status(404).json({
      errorMessages: [`Role requirement ${roleId} not found`],
      errors: {},
    });
  }

  res.status(201).json(assignment);
});

/**
 * PUT /rest/api/3/issue/:issueKey/roles/:roleId/assignments/:assignmentId
 * Update an assignment
 */
router.put('/issue/:issueKey/roles/:roleId/assignments/:assignmentId', (req: Request, res: Response) => {
  const { issueKey, roleId, assignmentId } = req.params;
  const updates = req.body;

  console.log(`[API v3] PUT /issue/${issueKey}/roles/${roleId}/assignments/${assignmentId}`);

  const updated = updateAssignment(assignmentId, updates);

  if (!updated) {
    return res.status(404).json({
      errorMessages: [`Assignment ${assignmentId} not found`],
      errors: {},
    });
  }

  res.json(updated);
});

/**
 * DELETE /rest/api/3/issue/:issueKey/roles/:roleId/assignments/:assignmentId
 * Delete an assignment
 */
router.delete('/issue/:issueKey/roles/:roleId/assignments/:assignmentId', (req: Request, res: Response) => {
  const { issueKey, roleId, assignmentId } = req.params;

  console.log(`[API v3] DELETE /issue/${issueKey}/roles/${roleId}/assignments/${assignmentId}`);

  const deleted = deleteAssignment(assignmentId);

  if (!deleted) {
    return res.status(404).json({
      errorMessages: [`Assignment ${assignmentId} not found`],
      errors: {},
    });
  }

  res.status(204).send();
});

/**
 * GET /rest/api/3/user/:userId/assignments
 * Get all role assignments for a user
 */
router.get('/user/:userId/assignments', (req: Request, res: Response) => {
  const { userId } = req.params;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  console.log(`[API v3] GET /user/${userId}/assignments`);

  const assignments = getAssignmentsForUser(userId);
  const totalAllocation = getUserTotalAllocation(userId, startDate, endDate);

  res.json({
    userId,
    assignments,
    totalAllocation,
    dateRange: startDate && endDate ? { startDate, endDate } : null,
  });
});

export default router;
