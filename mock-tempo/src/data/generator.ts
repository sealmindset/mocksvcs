import { faker } from '@faker-js/faker';
import seedrandom from 'seedrandom';
import {
  TempoUser,
  TempoWorklog,
  TempoAccount,
  TempoTeam,
  TempoTeamMember,
  TempoPlan,
  TempoFlexPlan,
  TempoTeamRole,
  TempoAccountCategory,
} from '../types/tempo';

// ============================================================================
// CONFIGURATION - Must match mock-jira for consistency
// ============================================================================
export const CONFIG = {
  // Must match mock-jira exactly
  SEED: process.env.DATA_SEED || 'capacity-planner-mock-2024',
  NUM_USERS: parseInt(process.env.NUM_USERS || '500', 10),
  START_YEAR: parseInt(process.env.START_YEAR || '2022', 10),
  CURRENT_YEAR: parseInt(process.env.CURRENT_YEAR || '2026', 10),

  // Tempo-specific config
  NUM_TEAMS: parseInt(process.env.NUM_TEAMS || '20', 10),
  WORKLOGS_PER_ISSUE_MIN: parseInt(process.env.WORKLOGS_PER_ISSUE_MIN || '30', 10),
  WORKLOGS_PER_ISSUE_MAX: parseInt(process.env.WORKLOGS_PER_ISSUE_MAX || '50', 10),
  PLANS_PER_USER_MIN: parseInt(process.env.PLANS_PER_USER_MIN || '2', 10),
  PLANS_PER_USER_MAX: parseInt(process.env.PLANS_PER_USER_MAX || '6', 10),
  MEMBERS_PER_TEAM_MIN: parseInt(process.env.MEMBERS_PER_TEAM_MIN || '15', 10),
  MEMBERS_PER_TEAM_MAX: parseInt(process.env.MEMBERS_PER_TEAM_MAX || '40', 10),
};

// ============================================================================
// SHARED CONSTANTS - Must match mock-jira
// ============================================================================
export const YEARS = Array.from(
  { length: CONFIG.CURRENT_YEAR - CONFIG.START_YEAR + 1 },
  (_, i) => CONFIG.START_YEAR + i
);

// Project prefixes - MUST match mock-jira exactly
const PROJECT_PREFIXES = ['ITPM', 'PROD', 'RD', 'INFRA', 'DATA', 'SEC', 'OPS', 'PLAT', 'WEB', 'MOB', 'API', 'SVC', 'INT', 'CRM', 'ERP'];

// Workstreams - MUST match mock-jira exactly
const WORKSTREAMS = [
  'Product-Value-Fit',
  'Funnel Optimization',
  'Customer Engagement',
  'Asset Portfolio',
  'Cost & Productivity',
  'Channel Expansion',
  'Fortify the Foundation',
  'Cybersecurity, Compliance, and Risk',
  'Run the Business',
];

// ============================================================================
// TEMPO-SPECIFIC DATA
// ============================================================================

// Teams aligned with project prefixes for mixed assignment
const TEAM_DEFINITIONS = [
  { name: 'IT Portfolio Management', prefixes: ['ITPM', 'INT'], summary: 'IT project portfolio and integration management' },
  { name: 'Product Engineering', prefixes: ['PROD', 'WEB', 'MOB'], summary: 'Core product development for web and mobile' },
  { name: 'Research & Development', prefixes: ['RD'], summary: 'Innovation and R&D initiatives' },
  { name: 'Infrastructure', prefixes: ['INFRA', 'OPS'], summary: 'Cloud infrastructure and operations' },
  { name: 'Data Engineering', prefixes: ['DATA'], summary: 'Data pipelines, analytics, and warehousing' },
  { name: 'Security & Compliance', prefixes: ['SEC'], summary: 'Cybersecurity and regulatory compliance' },
  { name: 'Platform Services', prefixes: ['PLAT', 'API', 'SVC'], summary: 'Platform, APIs, and shared services' },
  { name: 'CRM & ERP Systems', prefixes: ['CRM', 'ERP'], summary: 'Enterprise systems and customer relationship management' },
  { name: 'DevOps & SRE', prefixes: ['OPS', 'INFRA'], summary: 'Site reliability and DevOps practices' },
  { name: 'Quality Assurance', prefixes: ['PROD', 'WEB', 'MOB'], summary: 'Testing and quality engineering' },
  { name: 'UX & Design', prefixes: ['WEB', 'MOB', 'PROD'], summary: 'User experience and design systems' },
  { name: 'Analytics & BI', prefixes: ['DATA', 'CRM'], summary: 'Business intelligence and analytics' },
  { name: 'Integration Services', prefixes: ['INT', 'API', 'SVC'], summary: 'System integration and middleware' },
  { name: 'Cloud Operations', prefixes: ['INFRA', 'OPS', 'PLAT'], summary: 'Cloud management and optimization' },
  { name: 'Customer Success Tech', prefixes: ['CRM', 'SVC'], summary: 'Customer-facing technology solutions' },
  { name: 'Enterprise Architecture', prefixes: ['ITPM', 'PLAT', 'INT'], summary: 'Architecture governance and standards' },
  { name: 'Mobile Development', prefixes: ['MOB', 'API'], summary: 'Native and cross-platform mobile apps' },
  { name: 'Frontend Engineering', prefixes: ['WEB', 'PROD'], summary: 'Web frontend and UI development' },
  { name: 'Backend Services', prefixes: ['API', 'SVC', 'DATA'], summary: 'Backend APIs and microservices' },
  { name: 'Performance Engineering', prefixes: ['PLAT', 'INFRA', 'DATA'], summary: 'Performance optimization and scalability' },
];

// Account categories
const ACCOUNT_CATEGORIES: TempoAccountCategory[] = [
  { id: 1, key: 'WORKSTREAM', name: 'Workstream', type: { name: 'BILLABLE' } },
  { id: 2, key: 'PROJECT', name: 'Project', type: { name: 'BILLABLE' } },
  { id: 3, key: 'OVERHEAD', name: 'Overhead', type: { name: 'NON_BILLABLE' } },
  { id: 4, key: 'INTERNAL', name: 'Internal', type: { name: 'NON_BILLABLE' } },
];

// Overhead accounts
const OVERHEAD_ACCOUNTS = [
  { key: 'OVERHEAD-PTO', name: 'Paid Time Off', category: 'OVERHEAD' },
  { key: 'OVERHEAD-TRAINING', name: 'Training & Development', category: 'OVERHEAD' },
  { key: 'OVERHEAD-MEETINGS', name: 'General Meetings', category: 'OVERHEAD' },
  { key: 'OVERHEAD-ADMIN', name: 'Administrative Tasks', category: 'OVERHEAD' },
  { key: 'OVERHEAD-SUPPORT', name: 'Production Support', category: 'OVERHEAD' },
  { key: 'INTERNAL-HIRING', name: 'Recruiting & Hiring', category: 'INTERNAL' },
  { key: 'INTERNAL-ONBOARD', name: 'Onboarding', category: 'INTERNAL' },
  { key: 'INTERNAL-REVIEW', name: 'Performance Reviews', category: 'INTERNAL' },
];

// Team roles
const TEAM_ROLES: TempoTeamRole[] = [
  { id: 1, name: 'Member', default: true },
  { id: 2, name: 'Lead', default: false },
  { id: 3, name: 'Architect', default: false },
  { id: 4, name: 'Senior Developer', default: false },
  { id: 5, name: 'Developer', default: false },
  { id: 6, name: 'Designer', default: false },
  { id: 7, name: 'QA Engineer', default: false },
  { id: 8, name: 'DevOps Engineer', default: false },
  { id: 9, name: 'Product Manager', default: false },
  { id: 10, name: 'Scrum Master', default: false },
];

// Worklog descriptions aligned with typical activities
const WORKLOG_DESCRIPTIONS = [
  'Development work on feature implementation',
  'Code review and pull request feedback',
  'Bug investigation and fix',
  'Unit test development',
  'Integration testing',
  'Documentation updates',
  'Sprint planning session',
  'Daily standup and team sync',
  'Design review meeting',
  'Architecture discussion',
  'Backlog refinement',
  'Sprint retrospective',
  'Deployment and release activities',
  'Production monitoring',
  'Technical debt reduction',
  'Performance optimization',
  'Security review and remediation',
  'Pair programming session',
  'Mentoring and knowledge transfer',
  'Requirements gathering',
  'Stakeholder presentation',
  'Technical specification writing',
  'API design and development',
  'Database schema updates',
  'Infrastructure configuration',
  'CI/CD pipeline maintenance',
  'Incident response',
  'Root cause analysis',
  'Proof of concept development',
  'Vendor integration work',
];

// ============================================================================
// HASH FUNCTION - Must match mock-jira exactly
// ============================================================================
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ============================================================================
// CACHES
// ============================================================================
const userCache: Map<number, TempoUser> = new Map();
const teamCache: Map<number, TempoTeam> = new Map();
const accountCache: Map<string, TempoAccount> = new Map();
const teamMemberCache: Map<string, TempoTeamMember[]> = new Map();
const issueDataCache: Map<string, IssueData> = new Map();

// In-memory storage for modifications
const createdWorklogs: Map<number, TempoWorklog> = new Map();
const createdAccounts: Map<string, TempoAccount> = new Map();
const createdTeams: Map<number, TempoTeam> = new Map();
const createdPlans: Map<number, TempoPlan> = new Map();
const createdFlexPlans: Map<number, TempoFlexPlan> = new Map();

let nextWorklogId = 1000000;
let nextPlanId = 1000;
let nextFlexPlanId = 1000;
let nextMembershipId = 10000;

// ============================================================================
// ISSUE DATA INTERFACE - For linking with Jira issues
// ============================================================================
interface IssueData {
  key: string;
  projectKey: string;
  projectIndex: number;
  issueNumber: number;
  createdDate: Date;
  startDate: Date;
  endDate: Date;
  updatedDate: Date;
  assigneeIndex: number;
  reporterIndex: number;
  itOwnerIndices: number[];
  workstreamIndex: number;
  isMultiYear: boolean;
  fiscalYear: number;
}

// ============================================================================
// USER GENERATION - Must match mock-jira exactly
// ============================================================================
export function generateUser(index: number): TempoUser {
  if (userCache.has(index)) {
    return userCache.get(index)!;
  }

  faker.seed(hashCode(`${CONFIG.SEED}-user-${index}`));

  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  const user: TempoUser = {
    accountId: `user-${String(index).padStart(6, '0')}`,
    displayName: `${firstName} ${lastName}`,
    self: `/rest/api/3/user?accountId=user-${String(index).padStart(6, '0')}`,
  };

  userCache.set(index, user);
  return user;
}

export function getAllUsers(): TempoUser[] {
  const users: TempoUser[] = [];
  for (let i = 0; i < CONFIG.NUM_USERS; i++) {
    users.push(generateUser(i));
  }
  return users;
}

// ============================================================================
// ISSUE DATA GENERATION - Mirrors mock-jira issue generation
// ============================================================================
function getYearForProjectIndex(projectIndex: number): number {
  // Mirrors mock-jira's getYearForProjectIndex
  const rng = seedrandom(`${CONFIG.SEED}-year-${CONFIG.START_YEAR}-scale`);
  const scales: number[] = [];
  let totalProjects = 0;

  for (const year of YEARS) {
    const yearRng = seedrandom(`${CONFIG.SEED}-year-${year}-scale`);
    const scale = year === CONFIG.CURRENT_YEAR ? 1.0 : 0.8 + yearRng() * 0.4;
    const numProjects = Math.round(1500 * scale);
    scales.push(numProjects);

    if (projectIndex < totalProjects + numProjects) {
      return year;
    }
    totalProjects += numProjects;
  }
  return CONFIG.CURRENT_YEAR;
}

function isMultiYearProject(projectIndex: number): boolean {
  const rng = seedrandom(`${CONFIG.SEED}-project-${projectIndex}-multiyear`);
  return rng() < 0.30;
}

function getProjectDurationYears(projectIndex: number): number {
  if (!isMultiYearProject(projectIndex)) return 1;
  const rng = seedrandom(`${CONFIG.SEED}-project-${projectIndex}-duration`);
  return Math.floor(rng() * 3) + 1;
}

function generateProjectKey(projectIndex: number): string {
  const prefix = PROJECT_PREFIXES[projectIndex % PROJECT_PREFIXES.length];
  const suffix = Math.floor(projectIndex / PROJECT_PREFIXES.length);
  return suffix === 0 ? prefix : `${prefix}${suffix}`;
}

function getIssueData(projectKey: string, projectIndex: number, issueNumber: number): IssueData {
  const cacheKey = `${projectKey}-${issueNumber}`;
  if (issueDataCache.has(cacheKey)) {
    return issueDataCache.get(cacheKey)!;
  }

  // Seed exactly like mock-jira does
  faker.seed(hashCode(`${CONFIG.SEED}-${projectKey}-${issueNumber}`));
  const issueRng = seedrandom(`${CONFIG.SEED}-${projectKey}-${issueNumber}`);

  const projectStartYear = getYearForProjectIndex(projectIndex);
  const durationYears = getProjectDurationYears(projectIndex);
  const projectEndYear = Math.min(projectStartYear + durationYears - 1, CONFIG.CURRENT_YEAR);
  const isMultiYear = durationYears > 1;

  // Created date within the project's start year
  const createdDate = new Date(projectStartYear, Math.floor(issueRng() * 12), 1);
  createdDate.setDate(createdDate.getDate() + Math.floor(issueRng() * 28));

  // Start date shortly after created
  const startDate = new Date(createdDate);
  startDate.setDate(startDate.getDate() + Math.floor(issueRng() * 30));

  // End date based on project duration
  const endDate = new Date(startDate);
  if (isMultiYear) {
    const monthsToAdd = Math.floor(issueRng() * (durationYears * 12 - 1)) + 3;
    endDate.setMonth(endDate.getMonth() + monthsToAdd);
  } else {
    endDate.setMonth(endDate.getMonth() + Math.floor(issueRng() * 11) + 1);
  }

  // Cap end date to project end year
  const endYearDate = new Date(projectEndYear, 11, 31);
  if (endDate > endYearDate) {
    endDate.setTime(endYearDate.getTime());
    endDate.setDate(endDate.getDate() - Math.floor(issueRng() * 30));
  }

  // Updated date
  const updatedDate = new Date(endDate);
  updatedDate.setDate(updatedDate.getDate() - Math.floor(issueRng() * 30));
  if (updatedDate < createdDate) updatedDate.setTime(createdDate.getTime());

  // Skip through RNG calls to match mock-jira sequence
  issueRng(); // status roll
  issueRng(); // possibly more status
  issueRng(); // health status
  const priorityIndex = Math.floor(issueRng() * 5);
  const assigneeIndex = Math.floor(issueRng() * CONFIG.NUM_USERS);
  const reporterIndex = Math.floor(issueRng() * CONFIG.NUM_USERS);

  // Labels
  const numLabels = Math.floor(issueRng() * 4);
  for (let i = 0; i < numLabels; i++) {
    issueRng(); // label selection
  }

  // IT Owners
  const itOwnerCount = Math.floor(issueRng() * 3) + 1;
  const itOwnerIndices: number[] = [];
  for (let i = 0; i < itOwnerCount; i++) {
    itOwnerIndices.push(Math.floor(issueRng() * CONFIG.NUM_USERS));
  }

  // Business Champions
  const businessChampionCount = Math.floor(issueRng() * 2) + 1;
  for (let i = 0; i < businessChampionCount; i++) {
    issueRng(); // business champion
  }

  // Workstream
  const workstreamIndex = Math.floor(issueRng() * WORKSTREAMS.length);

  const issueData: IssueData = {
    key: cacheKey,
    projectKey,
    projectIndex,
    issueNumber,
    createdDate,
    startDate,
    endDate,
    updatedDate,
    assigneeIndex,
    reporterIndex,
    itOwnerIndices,
    workstreamIndex,
    isMultiYear,
    fiscalYear: projectStartYear,
  };

  issueDataCache.set(cacheKey, issueData);
  return issueData;
}

// ============================================================================
// ACCOUNT GENERATION - Hybrid approach
// ============================================================================
function initializeAccounts(): void {
  if (accountCache.size > 0) return;

  let accountId = 1;

  // 1. Workstream-based accounts
  for (let i = 0; i < WORKSTREAMS.length; i++) {
    const workstream = WORKSTREAMS[i];
    const key = `WS-${workstream.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20).toUpperCase()}`;

    faker.seed(hashCode(`${CONFIG.SEED}-account-workstream-${i}`));
    const leadIndex = Math.floor(faker.number.int({ min: 0, max: CONFIG.NUM_USERS - 1 }));

    const account: TempoAccount = {
      id: accountId++,
      key,
      name: workstream,
      status: 'OPEN',
      global: true,
      monthlyBudget: faker.number.int({ min: 100000, max: 500000 }),
      lead: generateUser(leadIndex),
      category: ACCOUNT_CATEGORIES[0], // WORKSTREAM
      links: { self: `/4/accounts/${key}` },
      self: `/4/accounts/${key}`,
    };
    accountCache.set(key, account);
  }

  // 2. Project-prefix-based accounts
  for (let i = 0; i < PROJECT_PREFIXES.length; i++) {
    const prefix = PROJECT_PREFIXES[i];
    const key = `PROJ-${prefix}`;

    faker.seed(hashCode(`${CONFIG.SEED}-account-project-${i}`));
    const leadIndex = Math.floor(faker.number.int({ min: 0, max: CONFIG.NUM_USERS - 1 }));

    const account: TempoAccount = {
      id: accountId++,
      key,
      name: `${prefix} Projects`,
      status: 'OPEN',
      global: false,
      monthlyBudget: faker.number.int({ min: 50000, max: 300000 }),
      lead: generateUser(leadIndex),
      category: ACCOUNT_CATEGORIES[1], // PROJECT
      links: { self: `/4/accounts/${key}` },
      self: `/4/accounts/${key}`,
    };
    accountCache.set(key, account);
  }

  // 3. Overhead/Internal accounts
  for (let i = 0; i < OVERHEAD_ACCOUNTS.length; i++) {
    const overhead = OVERHEAD_ACCOUNTS[i];

    faker.seed(hashCode(`${CONFIG.SEED}-account-overhead-${i}`));
    const leadIndex = Math.floor(faker.number.int({ min: 0, max: CONFIG.NUM_USERS - 1 }));

    const categoryIndex = overhead.category === 'OVERHEAD' ? 2 : 3;

    const account: TempoAccount = {
      id: accountId++,
      key: overhead.key,
      name: overhead.name,
      status: 'OPEN',
      global: true,
      lead: generateUser(leadIndex),
      category: ACCOUNT_CATEGORIES[categoryIndex],
      links: { self: `/4/accounts/${overhead.key}` },
      self: `/4/accounts/${overhead.key}`,
    };
    accountCache.set(overhead.key, account);
  }
}

export function getAccounts(offset = 0, limit = 50): { accounts: TempoAccount[]; total: number } {
  initializeAccounts();

  const allAccounts = [
    ...Array.from(createdAccounts.values()),
    ...Array.from(accountCache.values()),
  ];

  const total = allAccounts.length;
  const paginated = allAccounts.slice(offset, offset + limit);

  return { accounts: paginated, total };
}

export function getAccountByKeyOrId(keyOrId: string | number): TempoAccount | null {
  initializeAccounts();

  if (typeof keyOrId === 'string') {
    if (createdAccounts.has(keyOrId)) return createdAccounts.get(keyOrId)!;
    if (accountCache.has(keyOrId)) return accountCache.get(keyOrId)!;
  } else {
    for (const account of accountCache.values()) {
      if (account.id === keyOrId) return account;
    }
    for (const account of createdAccounts.values()) {
      if (account.id === keyOrId) return account;
    }
  }
  return null;
}

export function createAccount(input: {
  key: string;
  name: string;
  status?: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  leadAccountId?: string;
  contactAccountId?: string;
  monthlyBudget?: number;
  global?: boolean;
}): TempoAccount {
  initializeAccounts();
  const id = accountCache.size + createdAccounts.size + 1;

  let lead: TempoUser | undefined;
  if (input.leadAccountId) {
    const userIndex = parseInt(input.leadAccountId.replace('user-', ''));
    lead = generateUser(userIndex);
  }

  const account: TempoAccount = {
    id,
    key: input.key,
    name: input.name,
    status: input.status ?? 'OPEN',
    global: input.global ?? false,
    monthlyBudget: input.monthlyBudget,
    lead,
    links: { self: `/4/accounts/${input.key}` },
    self: `/4/accounts/${input.key}`,
  };

  createdAccounts.set(input.key, account);
  return account;
}

export function updateAccount(key: string, updates: Partial<TempoAccount>): TempoAccount | null {
  const account = getAccountByKeyOrId(key);
  if (!account) return null;

  const updated = { ...account, ...updates };
  createdAccounts.set(key, updated);
  return updated;
}

export function deleteAccount(key: string): boolean {
  return createdAccounts.delete(key);
}

export function searchAccounts(params: {
  keys?: string[];
  statuses?: ('OPEN' | 'CLOSED' | 'ARCHIVED')[];
  leadAccountIds?: string[];
  offset?: number;
  limit?: number;
}): { accounts: TempoAccount[]; total: number } {
  const { keys, statuses, leadAccountIds, offset = 0, limit = 50 } = params;

  let accounts = getAccounts(0, 1000).accounts;

  if (keys && keys.length > 0) {
    accounts = accounts.filter(a => keys.includes(a.key));
  }

  if (statuses && statuses.length > 0) {
    accounts = accounts.filter(a => statuses.includes(a.status));
  }

  if (leadAccountIds && leadAccountIds.length > 0) {
    accounts = accounts.filter(a => a.lead && leadAccountIds.includes(a.lead.accountId));
  }

  const total = accounts.length;
  const paginated = accounts.slice(offset, offset + limit);

  return { accounts: paginated, total };
}

// ============================================================================
// TEAM GENERATION - Mixed assignment with project alignment
// ============================================================================
export function generateTeam(index: number): TempoTeam {
  if (teamCache.has(index)) {
    return teamCache.get(index)!;
  }

  faker.seed(hashCode(`${CONFIG.SEED}-team-${index}`));

  const teamDef = TEAM_DEFINITIONS[index % TEAM_DEFINITIONS.length];
  const suffix = Math.floor(index / TEAM_DEFINITIONS.length);
  const name = suffix === 0 ? teamDef.name : `${teamDef.name} ${suffix + 1}`;

  const leadIndex = Math.floor(faker.number.int({ min: 0, max: CONFIG.NUM_USERS - 1 }));

  const team: TempoTeam = {
    id: index + 1,
    name,
    summary: teamDef.summary,
    lead: generateUser(leadIndex),
    links: { self: `/4/teams/${index + 1}` },
    self: `/4/teams/${index + 1}`,
  };

  teamCache.set(index, team);
  return team;
}

export function generateTeamMembers(teamId: number): TempoTeamMember[] {
  const cacheKey = String(teamId);
  if (teamMemberCache.has(cacheKey)) {
    return teamMemberCache.get(cacheKey)!;
  }

  const teamIndex = teamId - 1;
  const rng = seedrandom(`${CONFIG.SEED}-team-${teamIndex}-members`);

  const memberCount = Math.floor(
    rng() * (CONFIG.MEMBERS_PER_TEAM_MAX - CONFIG.MEMBERS_PER_TEAM_MIN + 1)
  ) + CONFIG.MEMBERS_PER_TEAM_MIN;

  const team = generateTeam(teamIndex);
  const teamDef = TEAM_DEFINITIONS[teamIndex % TEAM_DEFINITIONS.length];
  const members: TempoTeamMember[] = [];
  const usedUserIndices = new Set<number>();

  // Add team lead first
  if (team.lead) {
    const leadIndex = parseInt(team.lead.accountId.replace('user-', ''));
    usedUserIndices.add(leadIndex);

    members.push({
      id: teamId * 1000,
      team: { id: team.id, name: team.name, self: team.self },
      member: team.lead,
      membership: {
        id: teamId * 1000,
        commitmentPercent: 100,
        from: `${CONFIG.START_YEAR}-01-01`,
        role: TEAM_ROLES[1], // Lead
      },
      self: `/4/team-members/${teamId * 1000}`,
    });
  }

  // Add members with mixed assignment - some from project assignees, some random
  // Get some user indices from projects aligned with this team
  const alignedUserIndices: number[] = [];
  for (const prefix of teamDef.prefixes) {
    const prefixIndex = PROJECT_PREFIXES.indexOf(prefix);
    if (prefixIndex >= 0) {
      // Get assignees from first few issues in this project type
      for (let i = 0; i < 10; i++) {
        const projectIndex = prefixIndex + i * PROJECT_PREFIXES.length;
        const projectKey = generateProjectKey(projectIndex);

        // Get initiative assignee
        const initiative = getIssueData(projectKey, projectIndex, 1);
        alignedUserIndices.push(initiative.assigneeIndex);
        alignedUserIndices.push(...initiative.itOwnerIndices);

        // Get first epic assignee
        const epic = getIssueData(projectKey, projectIndex, 100);
        alignedUserIndices.push(epic.assigneeIndex);
      }
    }
  }

  // Mix: 60% from aligned projects, 40% random
  const uniqueAligned = [...new Set(alignedUserIndices)].filter(idx => !usedUserIndices.has(idx));
  const alignedCount = Math.floor((memberCount - 1) * 0.6);
  const randomCount = memberCount - 1 - alignedCount;

  // Add aligned members
  for (let i = 0; i < Math.min(alignedCount, uniqueAligned.length); i++) {
    const userIndex = uniqueAligned[i];
    if (usedUserIndices.has(userIndex)) continue;
    usedUserIndices.add(userIndex);

    const user = generateUser(userIndex);
    const roleIndex = Math.floor(rng() * TEAM_ROLES.length);
    const commitmentPercent = [50, 75, 100][Math.floor(rng() * 3)];

    const yearOffset = Math.floor(rng() * YEARS.length);
    const month = Math.floor(rng() * 12) + 1;
    const fromDate = `${CONFIG.START_YEAR + yearOffset}-${String(month).padStart(2, '0')}-01`;

    members.push({
      id: teamId * 1000 + members.length,
      team: { id: team.id, name: team.name, self: team.self },
      member: user,
      membership: {
        id: teamId * 1000 + members.length,
        commitmentPercent,
        from: fromDate,
        role: TEAM_ROLES[roleIndex],
      },
      self: `/4/team-members/${teamId * 1000 + members.length}`,
    });
  }

  // Add random members
  for (let i = 0; i < randomCount && members.length < memberCount; i++) {
    let userIndex: number;
    let attempts = 0;
    do {
      userIndex = Math.floor(rng() * CONFIG.NUM_USERS);
      attempts++;
    } while (usedUserIndices.has(userIndex) && attempts < 100);

    if (usedUserIndices.has(userIndex)) continue;
    usedUserIndices.add(userIndex);

    const user = generateUser(userIndex);
    const roleIndex = Math.floor(rng() * TEAM_ROLES.length);
    const commitmentPercent = [25, 50, 75, 100][Math.floor(rng() * 4)];

    const yearOffset = Math.floor(rng() * YEARS.length);
    const month = Math.floor(rng() * 12) + 1;
    const fromDate = `${CONFIG.START_YEAR + yearOffset}-${String(month).padStart(2, '0')}-01`;

    members.push({
      id: teamId * 1000 + members.length,
      team: { id: team.id, name: team.name, self: team.self },
      member: user,
      membership: {
        id: teamId * 1000 + members.length,
        commitmentPercent,
        from: fromDate,
        role: TEAM_ROLES[roleIndex],
      },
      self: `/4/team-members/${teamId * 1000 + members.length}`,
    });
  }

  teamMemberCache.set(cacheKey, members);
  return members;
}

export function getTeams(offset = 0, limit = 50): { teams: TempoTeam[]; total: number } {
  const teams: TempoTeam[] = [];
  const created = Array.from(createdTeams.values());
  teams.push(...created);

  for (let i = 0; i < CONFIG.NUM_TEAMS; i++) {
    teams.push(generateTeam(i));
  }

  const total = teams.length;
  const paginated = teams.slice(offset, offset + limit);

  return { teams: paginated, total };
}

export function getTeamById(id: number): TempoTeam | null {
  if (createdTeams.has(id)) return createdTeams.get(id)!;
  if (id > 0 && id <= CONFIG.NUM_TEAMS) return generateTeam(id - 1);
  return null;
}

export function createTeam(input: { name: string; summary?: string; leadAccountId?: string }): TempoTeam {
  const id = CONFIG.NUM_TEAMS + createdTeams.size + 1;

  let lead: TempoUser | undefined;
  if (input.leadAccountId) {
    const userIndex = parseInt(input.leadAccountId.replace('user-', ''));
    lead = generateUser(userIndex);
  }

  const team: TempoTeam = {
    id,
    name: input.name,
    summary: input.summary,
    lead,
    links: { self: `/4/teams/${id}` },
    self: `/4/teams/${id}`,
  };

  createdTeams.set(id, team);
  return team;
}

export function updateTeam(id: number, updates: Partial<TempoTeam>): TempoTeam | null {
  const team = getTeamById(id);
  if (!team) return null;
  const updated = { ...team, ...updates };
  createdTeams.set(id, updated);
  return updated;
}

export function deleteTeam(id: number): boolean {
  if (createdTeams.has(id)) {
    createdTeams.delete(id);
    teamMemberCache.delete(String(id));
    return true;
  }
  return false;
}

export function addTeamMember(teamId: number, input: {
  accountId: string;
  commitmentPercent?: number;
  from?: string;
  to?: string;
  roleId?: number;
}): TempoTeamMember | null {
  const team = getTeamById(teamId);
  if (!team) return null;

  const userIndex = parseInt(input.accountId.replace('user-', ''));
  const user = generateUser(userIndex);

  const membershipId = nextMembershipId++;
  const role = input.roleId
    ? TEAM_ROLES.find(r => r.id === input.roleId) ?? TEAM_ROLES[0]
    : TEAM_ROLES[0];

  const member: TempoTeamMember = {
    id: membershipId,
    team: { id: team.id, name: team.name, self: team.self },
    member: user,
    membership: {
      id: membershipId,
      commitmentPercent: input.commitmentPercent ?? 100,
      from: input.from,
      to: input.to,
      role,
    },
    self: `/4/team-members/${membershipId}`,
  };

  const cacheKey = String(teamId);
  const existing = teamMemberCache.get(cacheKey) ?? generateTeamMembers(teamId);
  existing.push(member);
  teamMemberCache.set(cacheKey, existing);

  return member;
}

export function removeTeamMember(teamId: number, memberId: number): boolean {
  const cacheKey = String(teamId);
  const members = teamMemberCache.get(cacheKey) ?? generateTeamMembers(teamId);
  const index = members.findIndex(m => m.id === memberId);
  if (index === -1) return false;
  members.splice(index, 1);
  teamMemberCache.set(cacheKey, members);
  return true;
}

// ============================================================================
// WORKLOG GENERATION - Issue lifecycle aligned, heavy density
// ============================================================================
export function generateWorklogsForIssue(
  issueKey: string,
  projectIndex: number,
  issueNumber: number
): TempoWorklog[] {
  const worklogs: TempoWorklog[] = [];
  const issue = getIssueData(issueKey.split('-')[0], projectIndex, issueNumber);

  const rng = seedrandom(`${CONFIG.SEED}-worklogs-${issueKey}`);

  const worklogCount = Math.floor(
    rng() * (CONFIG.WORKLOGS_PER_ISSUE_MAX - CONFIG.WORKLOGS_PER_ISSUE_MIN + 1)
  ) + CONFIG.WORKLOGS_PER_ISSUE_MIN;

  // Calculate working days between start and end dates
  // Use endDate (the planned end) rather than updatedDate for better spread
  const startTime = issue.startDate.getTime();
  const endTime = issue.endDate.getTime();
  // Ensure at least 60 days of spread for realistic worklog distribution
  const rawDays = Math.floor((endTime - startTime) / (24 * 60 * 60 * 1000));
  const totalDays = Math.max(60, rawDays);

  // Build pool of users who work on this issue
  const userPool: number[] = [
    issue.assigneeIndex,
    issue.reporterIndex,
    ...issue.itOwnerIndices,
  ];

  // Add some random team members
  for (let i = 0; i < 5; i++) {
    userPool.push(Math.floor(rng() * CONFIG.NUM_USERS));
  }

  // Get the account for this issue's workstream
  const workstreamAccount = `WS-${WORKSTREAMS[issue.workstreamIndex].replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20).toUpperCase()}`;
  const projectAccount = `PROJ-${issue.projectKey.replace(/\d+$/, '')}`;

  for (let i = 0; i < worklogCount; i++) {
    const worklogRng = seedrandom(`${CONFIG.SEED}-worklog-${issueKey}-${i}`);

    // Pick user from pool with higher probability for assignee
    const userPoolIndex = Math.floor(worklogRng() * userPool.length);
    const userIndex = userPool[userPoolIndex];
    const author = generateUser(userIndex);

    // Calculate worklog date within issue lifecycle
    const dayOffset = Math.floor(worklogRng() * totalDays);
    const worklogDate = new Date(startTime + dayOffset * 24 * 60 * 60 * 1000);

    // Skip weekends
    while (worklogDate.getDay() === 0 || worklogDate.getDay() === 6) {
      worklogDate.setDate(worklogDate.getDate() + 1);
    }

    // Don't create worklogs in the future
    const now = new Date();
    if (worklogDate > now) continue;

    const startHour = 8 + Math.floor(worklogRng() * 4);
    const startMinute = Math.floor(worklogRng() * 4) * 15;

    // Time spent: 1-8 hours, weighted toward 2-4 hours
    const hourOptions = [1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 6, 7, 8];
    const hours = hourOptions[Math.floor(worklogRng() * hourOptions.length)];
    const timeSpentSeconds = hours * 3600;

    // 80-95% of time is billable
    const billablePercent = 0.80 + worklogRng() * 0.15;
    const billableSeconds = Math.floor(timeSpentSeconds * billablePercent);

    const descriptionIndex = Math.floor(worklogRng() * WORKLOG_DESCRIPTIONS.length);

    const worklogId = hashCode(`${CONFIG.SEED}-worklog-${issueKey}-${i}`) % 10000000 + 1000000;

    // Alternate between workstream and project accounts
    const accountKey = worklogRng() > 0.5 ? workstreamAccount : projectAccount;

    worklogs.push({
      tempoWorklogId: worklogId,
      jiraWorklogId: worklogId + 1000000,
      issue: {
        id: projectIndex * 100000 + issueNumber,
        key: issueKey,
        self: `/rest/api/3/issue/${issueKey}`,
      },
      timeSpentSeconds,
      billableSeconds,
      startDate: worklogDate.toISOString().split('T')[0],
      startTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`,
      description: WORKLOG_DESCRIPTIONS[descriptionIndex],
      createdAt: new Date(worklogDate.getTime() + hours * 3600000).toISOString(),
      updatedAt: new Date(worklogDate.getTime() + hours * 3600000).toISOString(),
      author,
      attributes: [
        { key: '_Account_', value: accountKey },
      ],
      self: `/4/worklogs/${worklogId}`,
    });
  }

  return worklogs.sort((a, b) =>
    new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
}

export function searchWorklogs(params: {
  from?: string;
  to?: string;
  projectKeys?: string[];
  issueKeys?: string[];
  userAccountIds?: string[];
  accountKeys?: string[];
  offset?: number;
  limit?: number;
}): { worklogs: TempoWorklog[]; total: number } {
  const {
    from,
    to,
    projectKeys = [],
    issueKeys = [],
    userAccountIds = [],
    accountKeys = [],
    offset = 0,
    limit = 50
  } = params;

  const allWorklogs: TempoWorklog[] = [];

  if (issueKeys.length > 0) {
    for (const issueKey of issueKeys) {
      const parts = issueKey.split('-');
      if (parts.length !== 2) continue;

      const projectKey = parts[0];
      const issueNum = parseInt(parts[1]);

      // Find project index
      const basePrefix = projectKey.replace(/\d+$/, '');
      const prefixIndex = PROJECT_PREFIXES.indexOf(basePrefix);
      if (prefixIndex === -1) continue;

      const suffixMatch = projectKey.match(/\d+$/);
      const suffix = suffixMatch ? parseInt(suffixMatch[0]) : 0;
      const projectIndex = prefixIndex + suffix * PROJECT_PREFIXES.length;

      const worklogs = generateWorklogsForIssue(issueKey, projectIndex, issueNum);
      allWorklogs.push(...worklogs);
    }
  } else if (projectKeys.length > 0) {
    for (const projectKey of projectKeys) {
      const basePrefix = projectKey.replace(/\d+$/, '');
      const prefixIndex = PROJECT_PREFIXES.indexOf(basePrefix);
      if (prefixIndex === -1) continue;

      const suffixMatch = projectKey.match(/\d+$/);
      const suffix = suffixMatch ? parseInt(suffixMatch[0]) : 0;
      const projectIndex = prefixIndex + suffix * PROJECT_PREFIXES.length;

      // Generate worklogs for initiative and first 20 epics
      allWorklogs.push(...generateWorklogsForIssue(`${projectKey}-1`, projectIndex, 1));
      for (let e = 100; e < 120; e++) {
        allWorklogs.push(...generateWorklogsForIssue(`${projectKey}-${e}`, projectIndex, e));
      }
    }
  } else if (userAccountIds.length > 0) {
    // Get worklogs for specific users across sample projects
    for (let p = 0; p < Math.min(10, PROJECT_PREFIXES.length); p++) {
      const projectKey = generateProjectKey(p);
      for (let e = 100; e < 105; e++) {
        const worklogs = generateWorklogsForIssue(`${projectKey}-${e}`, p, e);
        allWorklogs.push(...worklogs.filter(w => userAccountIds.includes(w.author.accountId)));
      }
    }
  } else {
    // Default: sample worklogs from first few projects
    for (let p = 0; p < 5; p++) {
      const projectKey = generateProjectKey(p);
      allWorklogs.push(...generateWorklogsForIssue(`${projectKey}-1`, p, 1));
      for (let e = 100; e < 103; e++) {
        allWorklogs.push(...generateWorklogsForIssue(`${projectKey}-${e}`, p, e));
      }
    }
  }

  // Apply filters
  let filteredWorklogs = allWorklogs;

  if (from) {
    const fromDate = new Date(from);
    filteredWorklogs = filteredWorklogs.filter(w => new Date(w.startDate) >= fromDate);
  }

  if (to) {
    const toDate = new Date(to);
    filteredWorklogs = filteredWorklogs.filter(w => new Date(w.startDate) <= toDate);
  }

  if (userAccountIds.length > 0) {
    filteredWorklogs = filteredWorklogs.filter(w => userAccountIds.includes(w.author.accountId));
  }

  if (accountKeys.length > 0) {
    filteredWorklogs = filteredWorklogs.filter(w =>
      w.attributes?.some(attr => attr.key === '_Account_' && accountKeys.includes(attr.value))
    );
  }

  // Include created worklogs
  const created = Array.from(createdWorklogs.values()).filter(w => {
    if (from && new Date(w.startDate) < new Date(from)) return false;
    if (to && new Date(w.startDate) > new Date(to)) return false;
    if (issueKeys.length > 0 && !issueKeys.includes(w.issue.key)) return false;
    if (userAccountIds.length > 0 && !userAccountIds.includes(w.author.accountId)) return false;
    return true;
  });

  filteredWorklogs = [...created, ...filteredWorklogs];
  filteredWorklogs.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const total = filteredWorklogs.length;
  const paginated = filteredWorklogs.slice(offset, offset + limit);

  return { worklogs: paginated, total };
}

export function getWorklogById(id: number): TempoWorklog | null {
  if (createdWorklogs.has(id)) return createdWorklogs.get(id)!;
  return null;
}

export function createWorklog(input: {
  issueKey: string;
  timeSpentSeconds: number;
  billableSeconds?: number;
  startDate: string;
  startTime?: string;
  description?: string;
  authorAccountId: string;
  accountKey?: string;
}): TempoWorklog {
  const id = nextWorklogId++;
  const userIndex = parseInt(input.authorAccountId.replace('user-', ''));
  const author = generateUser(userIndex);

  const parts = input.issueKey.split('-');
  const projectKey = parts[0];
  const issueNum = parseInt(parts[1] || '0');

  const basePrefix = projectKey.replace(/\d+$/, '');
  const prefixIndex = PROJECT_PREFIXES.indexOf(basePrefix);
  const suffixMatch = projectKey.match(/\d+$/);
  const suffix = suffixMatch ? parseInt(suffixMatch[0]) : 0;
  const projectIndex = Math.max(0, prefixIndex + suffix * PROJECT_PREFIXES.length);

  const worklog: TempoWorklog = {
    tempoWorklogId: id,
    jiraWorklogId: id + 1000000,
    issue: {
      id: projectIndex * 100000 + issueNum,
      key: input.issueKey,
      self: `/rest/api/3/issue/${input.issueKey}`,
    },
    timeSpentSeconds: input.timeSpentSeconds,
    billableSeconds: input.billableSeconds ?? input.timeSpentSeconds,
    startDate: input.startDate,
    startTime: input.startTime ?? '09:00:00',
    description: input.description ?? '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author,
    attributes: input.accountKey ? [{ key: '_Account_', value: input.accountKey }] : undefined,
    self: `/4/worklogs/${id}`,
  };

  createdWorklogs.set(id, worklog);
  return worklog;
}

export function updateWorklog(id: number, updates: Partial<TempoWorklog>): TempoWorklog | null {
  const worklog = createdWorklogs.get(id);
  if (!worklog) return null;
  const updated = { ...worklog, ...updates, updatedAt: new Date().toISOString() };
  createdWorklogs.set(id, updated);
  return updated;
}

export function deleteWorklog(id: number): boolean {
  return createdWorklogs.delete(id);
}

// ============================================================================
// PLAN GENERATION - Linked to Jira projects
// ============================================================================
export function generatePlansForUser(userIndex: number): TempoPlan[] {
  const plans: TempoPlan[] = [];
  const rng = seedrandom(`${CONFIG.SEED}-plans-user-${userIndex}`);

  const planCount = Math.floor(
    rng() * (CONFIG.PLANS_PER_USER_MAX - CONFIG.PLANS_PER_USER_MIN + 1)
  ) + CONFIG.PLANS_PER_USER_MIN;

  const user = generateUser(userIndex);

  for (let i = 0; i < planCount; i++) {
    const planRng = seedrandom(`${CONFIG.SEED}-plan-user-${userIndex}-${i}`);

    const yearOffset = Math.floor(planRng() * YEARS.length);
    const startMonth = Math.floor(planRng() * 12) + 1;
    const startDate = new Date(CONFIG.START_YEAR + yearOffset, startMonth - 1, 1);

    const durationMonths = Math.floor(planRng() * 6) + 1;
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);

    const hoursPerDay = [2, 4, 4, 6, 6, 8][Math.floor(planRng() * 6)];
    const secondsPerDay = hoursPerDay * 3600;

    const projectIndex = Math.floor(planRng() * 50); // First 50 projects
    const projectKey = generateProjectKey(projectIndex);

    const planId = hashCode(`${CONFIG.SEED}-plan-user-${userIndex}-${i}`) % 1000000 + 100000;

    plans.push({
      id: planId,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      secondsPerDay,
      includeNonWorkingDays: false,
      description: `Resource allocation for ${projectKey} project`,
      createdAt: startDate.toISOString(),
      updatedAt: startDate.toISOString(),
      planItem: {
        id: 10000 + projectIndex,
        type: 'PROJECT',
        self: `/rest/api/3/project/${projectKey}`,
      },
      assignee: user,
      planApproval: {
        status: ['APPROVED', 'APPROVED', 'APPROVED', 'REQUESTED'][Math.floor(planRng() * 4)] as 'APPROVED' | 'REQUESTED',
      },
      self: `/4/plans/${planId}`,
    });
  }

  return plans;
}

export function searchPlans(params: {
  assigneeAccountIds?: string[];
  planItemTypes?: ('ISSUE' | 'PROJECT' | 'ACCOUNT')[];
  from?: string;
  to?: string;
  offset?: number;
  limit?: number;
}): { plans: TempoPlan[]; total: number } {
  const { assigneeAccountIds, planItemTypes, from, to, offset = 0, limit = 50 } = params;

  let allPlans: TempoPlan[] = [];
  allPlans.push(...Array.from(createdPlans.values()));

  const userIndices = assigneeAccountIds?.map(id => parseInt(id.replace('user-', '')))
    ?? Array.from({ length: 50 }, (_, i) => i);

  for (const userIndex of userIndices) {
    if (userIndex >= 0 && userIndex < CONFIG.NUM_USERS) {
      allPlans.push(...generatePlansForUser(userIndex));
    }
  }

  if (planItemTypes && planItemTypes.length > 0) {
    allPlans = allPlans.filter(p => planItemTypes.includes(p.planItem.type));
  }

  if (from) {
    const fromDate = new Date(from);
    allPlans = allPlans.filter(p => new Date(p.endDate) >= fromDate);
  }

  if (to) {
    const toDate = new Date(to);
    allPlans = allPlans.filter(p => new Date(p.startDate) <= toDate);
  }

  const total = allPlans.length;
  const paginated = allPlans.slice(offset, offset + limit);

  return { plans: paginated, total };
}

export function getPlanById(id: number): TempoPlan | null {
  if (createdPlans.has(id)) return createdPlans.get(id)!;

  for (let u = 0; u < Math.min(100, CONFIG.NUM_USERS); u++) {
    const plans = generatePlansForUser(u);
    const found = plans.find(p => p.id === id);
    if (found) return found;
  }

  return null;
}

export function createPlan(input: {
  startDate: string;
  endDate: string;
  secondsPerDay: number;
  includeNonWorkingDays?: boolean;
  description?: string;
  planItemType: 'ISSUE' | 'PROJECT' | 'ACCOUNT';
  planItemId: number;
  assigneeAccountId: string;
}): TempoPlan {
  const id = nextPlanId++;
  const userIndex = parseInt(input.assigneeAccountId.replace('user-', ''));
  const assignee = generateUser(userIndex);

  const plan: TempoPlan = {
    id,
    startDate: input.startDate,
    endDate: input.endDate,
    secondsPerDay: input.secondsPerDay,
    includeNonWorkingDays: input.includeNonWorkingDays ?? false,
    description: input.description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    planItem: { id: input.planItemId, type: input.planItemType },
    assignee,
    self: `/4/plans/${id}`,
  };

  createdPlans.set(id, plan);
  return plan;
}

export function updatePlan(id: number, updates: Partial<TempoPlan>): TempoPlan | null {
  const plan = getPlanById(id);
  if (!plan) return null;
  const updated = { ...plan, ...updates, updatedAt: new Date().toISOString() };
  createdPlans.set(id, updated);
  return updated;
}

export function deletePlan(id: number): boolean {
  return createdPlans.delete(id);
}

// ============================================================================
// FLEX PLAN OPERATIONS
// ============================================================================
export function createFlexPlan(input: {
  teamId: number;
  planItemType: 'ISSUE' | 'PROJECT' | 'ACCOUNT';
  planItemId: number;
  startDate: string;
  endDate: string;
  percentage?: number;
  secondsPerDay?: number;
  description?: string;
}): TempoFlexPlan | null {
  const team = getTeamById(input.teamId);
  if (!team) return null;

  const id = nextFlexPlanId++;

  const flexPlan: TempoFlexPlan = {
    id,
    team: { id: team.id, name: team.name, self: team.self },
    planItem: { id: input.planItemId, type: input.planItemType },
    dates: { startDate: input.startDate, endDate: input.endDate },
    rule: { percentage: input.percentage, secondsPerDay: input.secondsPerDay },
    description: input.description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    self: `/4/flex-plans/${id}`,
  };

  createdFlexPlans.set(id, flexPlan);
  return flexPlan;
}

export function getFlexPlanById(id: number): TempoFlexPlan | null {
  return createdFlexPlans.get(id) ?? null;
}

export function updateFlexPlan(id: number, updates: Partial<TempoFlexPlan>): TempoFlexPlan | null {
  const plan = createdFlexPlans.get(id);
  if (!plan) return null;
  const updated = { ...plan, ...updates, updatedAt: new Date().toISOString() };
  createdFlexPlans.set(id, updated);
  return updated;
}

export function deleteFlexPlan(id: number): boolean {
  return createdFlexPlans.delete(id);
}

export function searchFlexPlans(params: {
  teamIds?: number[];
  planItemTypes?: ('ISSUE' | 'PROJECT' | 'ACCOUNT')[];
  from?: string;
  to?: string;
  offset?: number;
  limit?: number;
}): { flexPlans: TempoFlexPlan[]; total: number } {
  const { teamIds, planItemTypes, from, to, offset = 0, limit = 50 } = params;

  let flexPlans = Array.from(createdFlexPlans.values());

  if (teamIds && teamIds.length > 0) {
    flexPlans = flexPlans.filter(p => teamIds.includes(p.team.id));
  }

  if (planItemTypes && planItemTypes.length > 0) {
    flexPlans = flexPlans.filter(p => planItemTypes.includes(p.planItem.type));
  }

  if (from) {
    flexPlans = flexPlans.filter(p => new Date(p.dates.endDate) >= new Date(from));
  }

  if (to) {
    flexPlans = flexPlans.filter(p => new Date(p.dates.startDate) <= new Date(to));
  }

  const total = flexPlans.length;
  const paginated = flexPlans.slice(offset, offset + limit);

  return { flexPlans: paginated, total };
}

// ============================================================================
// STATISTICS & UTILITIES
// ============================================================================
export function getStats() {
  initializeAccounts();

  return {
    config: CONFIG,
    totals: {
      users: CONFIG.NUM_USERS,
      teams: CONFIG.NUM_TEAMS,
      accounts: accountCache.size + createdAccounts.size,
      accountBreakdown: {
        workstream: WORKSTREAMS.length,
        project: PROJECT_PREFIXES.length,
        overhead: OVERHEAD_ACCOUNTS.length,
      },
      createdWorklogs: createdWorklogs.size,
      createdTeams: createdTeams.size,
      createdAccounts: createdAccounts.size,
      createdPlans: createdPlans.size,
      createdFlexPlans: createdFlexPlans.size,
    },
    dataRange: {
      startYear: CONFIG.START_YEAR,
      currentYear: CONFIG.CURRENT_YEAR,
      years: YEARS,
    },
    alignment: {
      projectPrefixes: PROJECT_PREFIXES,
      workstreams: WORKSTREAMS,
      worklogsPerIssue: `${CONFIG.WORKLOGS_PER_ISSUE_MIN}-${CONFIG.WORKLOGS_PER_ISSUE_MAX}`,
    },
  };
}

export function clearAllData() {
  createdWorklogs.clear();
  createdAccounts.clear();
  createdTeams.clear();
  createdPlans.clear();
  createdFlexPlans.clear();
  teamMemberCache.clear();
  issueDataCache.clear();
}

// Export constants
export { TEAM_ROLES, ACCOUNT_CATEGORIES, WORKSTREAMS, PROJECT_PREFIXES, WORKLOG_DESCRIPTIONS, TEAM_DEFINITIONS };
