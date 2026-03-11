import { faker } from '@faker-js/faker';
import seedrandom from 'seedrandom';
import {
  JiraUser,
  JiraProject,
  JiraIssue,
  JiraIssueType,
  JiraStatus,
  JiraPriority,
  JiraTransition,
} from '../types/jira';

// Configuration - can be overridden via environment variables
export const CONFIG = {
  // Current year (2026) baseline configuration
  NUM_PROJECTS: parseInt(process.env.NUM_PROJECTS || '1500', 10),
  NUM_INITIATIVES: parseInt(process.env.NUM_INITIATIVES || '1500', 10),
  EPICS_PER_PROJECT_MIN: parseInt(process.env.EPICS_PER_PROJECT_MIN || '200', 10),
  EPICS_PER_PROJECT_MAX: parseInt(process.env.EPICS_PER_PROJECT_MAX || '250', 10),
  TASKS_PER_EPIC_MIN: parseInt(process.env.TASKS_PER_EPIC_MIN || '100', 10),
  TASKS_PER_EPIC_MAX: parseInt(process.env.TASKS_PER_EPIC_MAX || '150', 10),
  NUM_USERS: parseInt(process.env.NUM_USERS || '500', 10),
  SEED: process.env.DATA_SEED || 'capacity-planner-mock-2024',

  // Historical data configuration
  START_YEAR: parseInt(process.env.START_YEAR || '2022', 10),
  CURRENT_YEAR: parseInt(process.env.CURRENT_YEAR || '2026', 10),
  YEAR_SCALE_MIN: parseFloat(process.env.YEAR_SCALE_MIN || '0.8'),  // 80% min
  YEAR_SCALE_MAX: parseFloat(process.env.YEAR_SCALE_MAX || '1.2'),  // 120% max
  MULTI_YEAR_PERCENTAGE: parseFloat(process.env.MULTI_YEAR_PERCENTAGE || '0.30'), // 30% span multiple years
};

// Calculate derived values
const YEARS = Array.from(
  { length: CONFIG.CURRENT_YEAR - CONFIG.START_YEAR + 1 },
  (_, i) => CONFIG.START_YEAR + i
);

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Year-specific random number generator
function getYearRng(year: number, suffix: string = ''): () => number {
  return seedrandom(`${CONFIG.SEED}-year-${year}${suffix}`);
}

// Get scale factor for a specific year (80-120% of baseline)
function getYearScale(year: number): number {
  if (year === CONFIG.CURRENT_YEAR) return 1.0; // Current year is 100%
  const rng = getYearRng(year, '-scale');
  return CONFIG.YEAR_SCALE_MIN + rng() * (CONFIG.YEAR_SCALE_MAX - CONFIG.YEAR_SCALE_MIN);
}

// Calculate projects per year
interface YearConfig {
  year: number;
  numProjects: number;
  numInitiatives: number;
  projectStartIndex: number; // Global project index start
  initiativeStartIndex: number; // Global initiative index start
  scale: number;
}

const yearConfigs: Map<number, YearConfig> = new Map();
let totalProjectsAllYears = 0;
let totalInitiativesAllYears = 0;

// Initialize year configurations
function initYearConfigs() {
  if (yearConfigs.size > 0) return;

  let projectOffset = 0;
  let initiativeOffset = 0;

  for (const year of YEARS) {
    const scale = getYearScale(year);
    const numProjects = Math.round(CONFIG.NUM_PROJECTS * scale);
    const numInitiatives = Math.round(CONFIG.NUM_INITIATIVES * scale);

    yearConfigs.set(year, {
      year,
      numProjects,
      numInitiatives,
      projectStartIndex: projectOffset,
      initiativeStartIndex: initiativeOffset,
      scale,
    });

    projectOffset += numProjects;
    initiativeOffset += numInitiatives;
  }

  totalProjectsAllYears = projectOffset;
  totalInitiativesAllYears = initiativeOffset;
}

// Initialize on module load
initYearConfigs();

// Get year for a project based on its global index
function getYearForProjectIndex(globalIndex: number): number {
  for (const [year, config] of yearConfigs) {
    if (globalIndex < config.projectStartIndex + config.numProjects) {
      return year;
    }
  }
  return CONFIG.CURRENT_YEAR;
}

// Get year config
function getYearConfig(year: number): YearConfig | undefined {
  return yearConfigs.get(year);
}

// Static data
const ISSUE_TYPES: JiraIssueType[] = [
  { id: '10000', name: 'Epic', description: 'A big user story that needs to be broken down', iconUrl: '/images/icons/epic.svg', subtask: false, hierarchyLevel: 1, self: '/rest/api/3/issuetype/10000' },
  { id: '10001', name: 'Initiative', description: 'A collection of epics that together achieve a broader goal', iconUrl: '/images/icons/initiative.svg', subtask: false, hierarchyLevel: 0, self: '/rest/api/3/issuetype/10001' },
  { id: '10002', name: 'Story', description: 'A user story', iconUrl: '/images/icons/story.svg', subtask: false, hierarchyLevel: 2, self: '/rest/api/3/issuetype/10002' },
  { id: '10003', name: 'Task', description: 'A task that needs to be done', iconUrl: '/images/icons/task.svg', subtask: false, hierarchyLevel: 2, self: '/rest/api/3/issuetype/10003' },
  { id: '10004', name: 'Bug', description: 'A problem which impairs or prevents product functions', iconUrl: '/images/icons/bug.svg', subtask: false, hierarchyLevel: 2, self: '/rest/api/3/issuetype/10004' },
  { id: '10005', name: 'Sub-task', description: 'A subtask of an issue', iconUrl: '/images/icons/subtask.svg', subtask: true, hierarchyLevel: 3, self: '/rest/api/3/issuetype/10005' },
];

// Historical statuses (for closed projects)
const HISTORICAL_STATUSES: JiraStatus[] = [
  { id: '3', name: 'Done', description: 'Issue is completed', statusCategory: { id: 3, key: 'done', colorName: 'green', name: 'Done', self: '/rest/api/3/statuscategory/3' }, self: '/rest/api/3/status/3' },
  { id: '8', name: 'Cancelled', description: 'Issue has been cancelled', statusCategory: { id: 3, key: 'done', colorName: 'green', name: 'Done', self: '/rest/api/3/statuscategory/3' }, self: '/rest/api/3/status/8' },
];

// Active statuses (for current year or carried-forward projects)
const ACTIVE_STATUSES: JiraStatus[] = [
  { id: '1', name: 'Open', description: 'Issue is open', statusCategory: { id: 2, key: 'new', colorName: 'blue-gray', name: 'To Do', self: '/rest/api/3/statuscategory/2' }, self: '/rest/api/3/status/1' },
  { id: '2', name: 'In Progress', description: 'Issue is being worked on', statusCategory: { id: 4, key: 'indeterminate', colorName: 'yellow', name: 'In Progress', self: '/rest/api/3/statuscategory/4' }, self: '/rest/api/3/status/2' },
  { id: '4', name: 'Discovery', description: 'Issue is in discovery phase', statusCategory: { id: 2, key: 'new', colorName: 'blue-gray', name: 'To Do', self: '/rest/api/3/statuscategory/2' }, self: '/rest/api/3/status/4' },
  { id: '5', name: 'Planning', description: 'Issue is being planned', statusCategory: { id: 4, key: 'indeterminate', colorName: 'yellow', name: 'In Progress', self: '/rest/api/3/statuscategory/4' }, self: '/rest/api/3/status/5' },
  { id: '6', name: 'Development', description: 'Issue is in development', statusCategory: { id: 4, key: 'indeterminate', colorName: 'yellow', name: 'In Progress', self: '/rest/api/3/statuscategory/4' }, self: '/rest/api/3/status/6' },
  { id: '7', name: 'Testing', description: 'Issue is being tested', statusCategory: { id: 4, key: 'indeterminate', colorName: 'yellow', name: 'In Progress', self: '/rest/api/3/statuscategory/4' }, self: '/rest/api/3/status/7' },
];

const STATUSES: JiraStatus[] = [
  ...ACTIVE_STATUSES,
  { id: '3', name: 'Done', description: 'Issue is completed', statusCategory: { id: 3, key: 'done', colorName: 'green', name: 'Done', self: '/rest/api/3/statuscategory/3' }, self: '/rest/api/3/status/3' },
  { id: '8', name: 'Cancelled', description: 'Issue has been cancelled', statusCategory: { id: 3, key: 'done', colorName: 'green', name: 'Done', self: '/rest/api/3/statuscategory/3' }, self: '/rest/api/3/status/8' },
];

const PRIORITIES: JiraPriority[] = [
  { id: '1', name: 'Highest', iconUrl: '/images/icons/priority-highest.svg', self: '/rest/api/3/priority/1' },
  { id: '2', name: 'High', iconUrl: '/images/icons/priority-high.svg', self: '/rest/api/3/priority/2' },
  { id: '3', name: 'Medium', iconUrl: '/images/icons/priority-medium.svg', self: '/rest/api/3/priority/3' },
  { id: '4', name: 'Low', iconUrl: '/images/icons/priority-low.svg', self: '/rest/api/3/priority/4' },
  { id: '5', name: 'Lowest', iconUrl: '/images/icons/priority-lowest.svg', self: '/rest/api/3/priority/5' },
];

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

const HEALTH_STATUSES = ['On Track', 'At Risk', 'Off Track', 'Complete'];

const CAPITAL_EXPENSE_OPTIONS = ['Capital', 'Expense', 'Mixed'];

const LABELS = [
  'backend', 'frontend', 'api', 'database', 'security', 'performance',
  'ux', 'mobile', 'cloud', 'devops', 'testing', 'documentation',
  'refactoring', 'tech-debt', 'feature', 'enhancement', 'critical',
];

// Cache for generated data
const userCache: Map<number, JiraUser> = new Map();
const projectCache: Map<number, JiraProject> = new Map();

// Generate user by index (deterministic)
export function generateUser(index: number): JiraUser {
  if (userCache.has(index)) {
    return userCache.get(index)!;
  }

  faker.seed(hashCode(`${CONFIG.SEED}-user-${index}`));

  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const user: JiraUser = {
    accountId: `user-${String(index).padStart(6, '0')}`,
    accountType: 'atlassian',
    emailAddress: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`,
    displayName: `${firstName} ${lastName}`,
    active: true,
    timeZone: 'America/Chicago',
    locale: 'en_US',
    avatarUrls: {
      '48x48': `https://avatar.example.com/${index}/48`,
      '24x24': `https://avatar.example.com/${index}/24`,
      '16x16': `https://avatar.example.com/${index}/16`,
      '32x32': `https://avatar.example.com/${index}/32`,
    },
    self: `/rest/api/3/user?accountId=user-${String(index).padStart(6, '0')}`,
  };

  userCache.set(index, user);
  return user;
}

// Generate project by index (deterministic)
export function generateProject(index: number): JiraProject {
  if (projectCache.has(index)) {
    return projectCache.get(index)!;
  }

  faker.seed(hashCode(`${CONFIG.SEED}-project-${index}`));

  const prefixes = ['ITPM', 'PROD', 'RD', 'INFRA', 'DATA', 'SEC', 'OPS', 'PLAT', 'WEB', 'MOB', 'API', 'SVC', 'INT', 'CRM', 'ERP'];
  const prefix = prefixes[index % prefixes.length];
  const suffix = Math.floor(index / prefixes.length);
  const key = suffix === 0 ? prefix : `${prefix}${suffix}`;

  const project: JiraProject = {
    id: String(10000 + index),
    key,
    name: faker.company.catchPhrase(),
    description: faker.lorem.paragraph(),
    lead: generateUser(index % CONFIG.NUM_USERS),
    projectTypeKey: 'software',
    simplified: false,
    style: 'classic',
    isPrivate: false,
    avatarUrls: {
      '48x48': `https://project-avatar.example.com/${index}/48`,
      '24x24': `https://project-avatar.example.com/${index}/24`,
      '16x16': `https://project-avatar.example.com/${index}/16`,
      '32x32': `https://project-avatar.example.com/${index}/32`,
    },
    self: `/rest/api/3/project/${key}`,
    issueTypes: ISSUE_TYPES,
  };

  projectCache.set(index, project);
  return project;
}

// Calculate epic count for a project (year-aware)
function getEpicCountForProject(projectIndex: number): number {
  const projectRng = seedrandom(`${CONFIG.SEED}-project-${projectIndex}-epic-count`);
  const year = getYearForProjectIndex(projectIndex);
  const yearConfig = getYearConfig(year);
  const scale = yearConfig?.scale || 1.0;

  const baseMin = CONFIG.EPICS_PER_PROJECT_MIN;
  const baseMax = CONFIG.EPICS_PER_PROJECT_MAX;
  const scaledMin = Math.round(baseMin * scale);
  const scaledMax = Math.round(baseMax * scale);

  return Math.floor(projectRng() * (scaledMax - scaledMin + 1)) + scaledMin;
}

// Determine if a project spans multiple years
function isMultiYearProject(projectIndex: number): boolean {
  const rng = seedrandom(`${CONFIG.SEED}-project-${projectIndex}-multiyear`);
  return rng() < CONFIG.MULTI_YEAR_PERCENTAGE;
}

// Get project duration in years (1-3 years for multi-year projects)
function getProjectDurationYears(projectIndex: number): number {
  if (!isMultiYearProject(projectIndex)) return 1;
  const rng = seedrandom(`${CONFIG.SEED}-project-${projectIndex}-duration`);
  return Math.floor(rng() * 3) + 1; // 1-3 years
}

// Get status for an issue based on year and project characteristics
function getStatusForIssue(
  projectIndex: number,
  issueNumber: number,
  startYear: number,
  endYear: number,
  issueRng: () => number
): JiraStatus {
  const currentYear = CONFIG.CURRENT_YEAR;
  const isCurrentYear = endYear >= currentYear;
  const isHistorical = endYear < currentYear;

  if (isCurrentYear) {
    // Current year - use full status distribution
    const statusIndex = Math.floor(issueRng() * STATUSES.length);
    return STATUSES[statusIndex];
  }

  // Historical project - realistic distribution
  // 70% Done, 15% Cancelled, 10% carried forward (In Progress), 5% other
  const roll = issueRng();

  if (roll < 0.70) {
    // Done
    return STATUSES.find(s => s.name === 'Done')!;
  } else if (roll < 0.85) {
    // Cancelled
    return STATUSES.find(s => s.name === 'Cancelled')!;
  } else if (roll < 0.95) {
    // Carried forward - still in progress (long-running projects)
    const activeStatuses = ACTIVE_STATUSES.filter(s => s.name !== 'Open');
    return activeStatuses[Math.floor(issueRng() * activeStatuses.length)];
  } else {
    // Other - could be stuck in various states
    return ACTIVE_STATUSES[Math.floor(issueRng() * ACTIVE_STATUSES.length)];
  }
}

// Generate issue with year-aware dates and statuses
export function generateIssue(
  projectKey: string,
  projectIndex: number,
  issueNumber: number,
  issueType: JiraIssueType,
  parentKey?: string
): JiraIssue {
  faker.seed(hashCode(`${CONFIG.SEED}-${projectKey}-${issueNumber}`));
  const issueRng = seedrandom(`${CONFIG.SEED}-${projectKey}-${issueNumber}`);

  const key = `${projectKey}-${issueNumber}`;
  const project = generateProject(projectIndex);

  // Determine project year and duration
  const projectStartYear = getYearForProjectIndex(projectIndex);
  const durationYears = getProjectDurationYears(projectIndex);
  const projectEndYear = Math.min(projectStartYear + durationYears - 1, CONFIG.CURRENT_YEAR);
  const isMultiYear = durationYears > 1;

  // Generate dates based on project year span
  const startYearDate = new Date(projectStartYear, 0, 1);
  const endYearDate = new Date(projectEndYear, 11, 31);

  // Created date within the project's start year
  const createdDate = new Date(projectStartYear, Math.floor(issueRng() * 12), 1);
  createdDate.setDate(createdDate.getDate() + Math.floor(issueRng() * 28));

  // Start date shortly after created
  const startDate = new Date(createdDate);
  startDate.setDate(startDate.getDate() + Math.floor(issueRng() * 30));

  // End date based on project duration
  const endDate = new Date(startDate);
  if (isMultiYear) {
    // Multi-year project: end date in later year
    const monthsToAdd = Math.floor(issueRng() * (durationYears * 12 - 1)) + 3;
    endDate.setMonth(endDate.getMonth() + monthsToAdd);
  } else {
    // Single year project: end within 1-11 months
    endDate.setMonth(endDate.getMonth() + Math.floor(issueRng() * 11) + 1);
  }

  // Cap end date to project end year
  if (endDate > endYearDate) {
    endDate.setTime(endYearDate.getTime());
    endDate.setDate(endDate.getDate() - Math.floor(issueRng() * 30));
  }

  // Updated date
  const updatedDate = new Date(endDate);
  updatedDate.setDate(updatedDate.getDate() - Math.floor(issueRng() * 30));
  if (updatedDate < createdDate) updatedDate.setTime(createdDate.getTime());

  // In-service date (after end date)
  const inserviceDate = new Date(endDate);
  inserviceDate.setDate(inserviceDate.getDate() + Math.floor(issueRng() * 30));

  // Get status based on project timeline
  const status = getStatusForIssue(projectIndex, issueNumber, projectStartYear, projectEndYear, issueRng);

  // For completed projects, set health status to Complete
  const isCompleted = status.name === 'Done';
  const healthStatus = isCompleted ? 'Complete' : HEALTH_STATUSES[Math.floor(issueRng() * (HEALTH_STATUSES.length - 1))];

  const priorityIndex = Math.floor(issueRng() * PRIORITIES.length);
  const assigneeIndex = Math.floor(issueRng() * CONFIG.NUM_USERS);
  const reporterIndex = Math.floor(issueRng() * CONFIG.NUM_USERS);

  // Generate labels
  const numLabels = Math.floor(issueRng() * 4);
  const labels: string[] = [];
  for (let i = 0; i < numLabels; i++) {
    labels.push(LABELS[Math.floor(issueRng() * LABELS.length)]);
  }

  // Add year-specific labels
  labels.push(`fy${projectStartYear}`);
  if (isMultiYear) {
    labels.push('multi-year');
    labels.push(`fy${projectEndYear}`);
  }

  // Custom field values
  const itOwnerCount = Math.floor(issueRng() * 3) + 1;
  const itOwners: JiraUser[] = [];
  for (let i = 0; i < itOwnerCount; i++) {
    itOwners.push(generateUser(Math.floor(issueRng() * CONFIG.NUM_USERS)));
  }

  const businessChampionCount = Math.floor(issueRng() * 2) + 1;
  const businessChampions: JiraUser[] = [];
  for (let i = 0; i < businessChampionCount; i++) {
    businessChampions.push(generateUser(Math.floor(issueRng() * CONFIG.NUM_USERS)));
  }

  const issue: JiraIssue = {
    id: String(100000 + projectIndex * 100000 + issueNumber),
    key,
    self: `/rest/api/3/issue/${key}`,
    fields: {
      summary: issueType.name === 'Initiative'
        ? `[FY${projectStartYear}${isMultiYear ? `-${projectEndYear}` : ''}] ${faker.company.buzzPhrase()}`
        : issueType.name === 'Epic'
          ? `Epic: ${faker.hacker.phrase()}`
          : faker.hacker.phrase(),
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: faker.lorem.paragraphs(2) }],
          },
        ],
      },
      status,
      assignee: generateUser(assigneeIndex),
      reporter: generateUser(reporterIndex),
      priority: PRIORITIES[priorityIndex],
      issuetype: issueType,
      project: {
        id: project.id,
        key: project.key,
        name: project.name,
        self: project.self,
      },
      created: createdDate.toISOString(),
      updated: updatedDate.toISOString(),
      duedate: endDate.toISOString().split('T')[0],
      labels: [...new Set(labels)],
      // Custom fields
      customfield_10000: itOwners,
      customfield_10078: businessChampions,
      customfield_10447: { value: WORKSTREAMS[Math.floor(issueRng() * WORKSTREAMS.length)] },
      customfield_10121: inserviceDate.toISOString().split('T')[0],
      customfield_10015: startDate.toISOString().split('T')[0],
      customfield_10685: endDate.toISOString().split('T')[0],
      customfield_10132: `PAR-${projectStartYear}-${String(Math.floor(issueRng() * 10000)).padStart(5, '0')}`,
      customfield_10451: { value: healthStatus },
      customfield_10200: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: faker.company.buzzPhrase() }],
          },
        ],
      },
      customfield_10450: { value: CAPITAL_EXPENSE_OPTIONS[Math.floor(issueRng() * CAPITAL_EXPENSE_OPTIONS.length)] },
      // Additional metadata
      customfield_fiscalYear: projectStartYear,
      customfield_projectEndYear: projectEndYear,
      customfield_isMultiYear: isMultiYear,
    },
  };

  if (parentKey) {
    issue.fields.parent = {
      id: String(100000 + projectIndex * 100000 + parseInt(parentKey.split('-')[1])),
      key: parentKey,
      self: `/rest/api/3/issue/${parentKey}`,
      fields: {
        summary: `Parent: ${faker.hacker.phrase()}`,
        status: STATUSES[Math.floor(issueRng() * STATUSES.length)],
        issuetype: ISSUE_TYPES[0],
      },
    };
  }

  return issue;
}

// Search issues with JQL-like filtering
export interface SearchParams {
  projectKey?: string;
  issueTypes?: string[];
  startAt?: number;
  maxResults?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  year?: number; // Filter by fiscal year
}

export function searchIssues(params: SearchParams): { issues: JiraIssue[]; total: number } {
  const { projectKey, issueTypes, startAt = 0, maxResults = 50, year } = params;

  // Find project
  let projectIndex = -1;
  for (let i = 0; i < totalProjectsAllYears; i++) {
    const project = generateProject(i);
    if (project.key === projectKey) {
      projectIndex = i;
      break;
    }
  }

  if (projectIndex === -1 && projectKey) {
    return { issues: [], total: 0 };
  }

  const issues: JiraIssue[] = [];
  let total = 0;

  // If no issueTypes specified, default to returning both initiatives and epics
  const hasInitiative = !issueTypes || issueTypes.length === 0 || issueTypes.includes('10001');
  const hasEpic = !issueTypes || issueTypes.length === 0 || issueTypes.includes('10000');

  if (hasInitiative || hasEpic) {
    const project = generateProject(projectIndex);
    const epicCount = getEpicCountForProject(projectIndex);

    if (hasInitiative) total += 1;
    if (hasEpic) total += epicCount;

    let currentIndex = 0;

    if (hasInitiative) {
      if (currentIndex >= startAt && issues.length < maxResults) {
        const initiative = generateIssue(project.key, projectIndex, 1, ISSUE_TYPES[1]);
        // Filter by year if specified
        if (!year || initiative.fields.customfield_fiscalYear === year ||
            (initiative.fields.customfield_isMultiYear &&
             year >= initiative.fields.customfield_fiscalYear &&
             year <= initiative.fields.customfield_projectEndYear)) {
          issues.push(initiative);
        }
      }
      currentIndex++;
    }

    if (hasEpic) {
      for (let e = 0; e < epicCount; e++) {
        if (currentIndex >= startAt && issues.length < maxResults) {
          const epic = generateIssue(project.key, projectIndex, 100 + e, ISSUE_TYPES[0]);
          // Filter by year if specified
          if (!year || epic.fields.customfield_fiscalYear === year ||
              (epic.fields.customfield_isMultiYear &&
               year >= epic.fields.customfield_fiscalYear &&
               year <= epic.fields.customfield_projectEndYear)) {
            issues.push(epic);
          }
        }
        currentIndex++;
        if (issues.length >= maxResults) break;
      }
    }
  }

  issues.sort((a, b) => {
    const aNum = parseInt(a.key.split('-')[1]);
    const bNum = parseInt(b.key.split('-')[1]);
    return bNum - aNum;
  });

  return { issues, total };
}

// Get all projects with pagination (across all years)
export function getProjects(startAt: number = 0, maxResults: number = 50): { values: JiraProject[]; total: number; isLast: boolean } {
  const projects: JiraProject[] = [];

  for (let i = startAt; i < Math.min(startAt + maxResults, totalProjectsAllYears); i++) {
    projects.push(generateProject(i));
  }

  return {
    values: projects,
    total: totalProjectsAllYears,
    isLast: startAt + maxResults >= totalProjectsAllYears,
  };
}

// Get projects by year
export function getProjectsByYear(year: number, startAt: number = 0, maxResults: number = 50): { values: JiraProject[]; total: number; isLast: boolean } {
  const yearConfig = getYearConfig(year);
  if (!yearConfig) {
    return { values: [], total: 0, isLast: true };
  }

  const projects: JiraProject[] = [];
  const start = yearConfig.projectStartIndex + startAt;
  const end = Math.min(start + maxResults, yearConfig.projectStartIndex + yearConfig.numProjects);

  for (let i = start; i < end; i++) {
    projects.push(generateProject(i));
  }

  return {
    values: projects,
    total: yearConfig.numProjects,
    isLast: startAt + maxResults >= yearConfig.numProjects,
  };
}

// Get project by key
export function getProjectByKey(key: string): JiraProject | null {
  for (let i = 0; i < totalProjectsAllYears; i++) {
    const project = generateProject(i);
    if (project.key === key) {
      return project;
    }
  }
  return null;
}

// Get issue by key
export function getIssueByKey(key: string): JiraIssue | null {
  const [projectKey, issueNumStr] = key.split('-');
  const issueNum = parseInt(issueNumStr);

  let projectIndex = -1;
  for (let i = 0; i < totalProjectsAllYears; i++) {
    const project = generateProject(i);
    if (project.key === projectKey) {
      projectIndex = i;
      break;
    }
  }

  if (projectIndex === -1) return null;

  let issueType: JiraIssueType;
  if (issueNum === 1) {
    issueType = ISSUE_TYPES[1];
  } else if (issueNum >= 100 && issueNum < 10000) {
    issueType = ISSUE_TYPES[0];
  } else {
    issueType = ISSUE_TYPES[2];
  }

  return generateIssue(projectKey, projectIndex, issueNum, issueType);
}

// Get users with search
export function searchUsers(query: string = '', maxResults: number = 50): JiraUser[] {
  const users: JiraUser[] = [];
  const lowerQuery = query.toLowerCase();

  for (let i = 0; i < CONFIG.NUM_USERS && users.length < maxResults; i++) {
    const user = generateUser(i);
    if (!query || user.displayName.toLowerCase().includes(lowerQuery) || user.emailAddress.toLowerCase().includes(lowerQuery)) {
      users.push(user);
    }
  }

  return users;
}

// Get available transitions for an issue
export function getTransitions(issueKey: string): JiraTransition[] {
  const issue = getIssueByKey(issueKey);
  if (!issue) return [];

  const currentStatus = issue.fields.status.name;

  const transitionMap: { [key: string]: string[] } = {
    'Open': ['In Progress', 'Discovery', 'Cancelled'],
    'Discovery': ['Planning', 'Open', 'Cancelled'],
    'Planning': ['Development', 'Discovery', 'Cancelled'],
    'In Progress': ['Done', 'Testing', 'Open'],
    'Development': ['Testing', 'Planning', 'Cancelled'],
    'Testing': ['Done', 'Development', 'Cancelled'],
    'Done': ['Open'],
    'Cancelled': ['Open'],
  };

  const availableStatuses = transitionMap[currentStatus] || ['Open'];

  return availableStatuses.map((statusName, index) => {
    const targetStatus = STATUSES.find(s => s.name === statusName) || STATUSES[0];
    return {
      id: String(100 + index),
      name: `Move to ${statusName}`,
      to: targetStatus,
      hasScreen: false,
      isGlobal: false,
      isInitial: false,
      isConditional: false,
    };
  });
}

// Field metadata for createmeta endpoint
export function getFieldMetadata(projectKey: string) {
  const project = getProjectByKey(projectKey);
  if (!project) return null;

  return {
    projects: [
      {
        id: project.id,
        key: project.key,
        name: project.name,
        issuetypes: [
          {
            id: '10001',
            name: 'Initiative',
            fields: {
              customfield_10447: {
                name: 'Workstream',
                allowedValues: WORKSTREAMS.map(w => ({ value: w })),
              },
              customfield_10451: {
                name: 'Health Status',
                allowedValues: HEALTH_STATUSES.map(h => ({ value: h })),
              },
              customfield_10450: {
                name: 'Capital/Expense',
                allowedValues: CAPITAL_EXPENSE_OPTIONS.map(c => ({ value: c })),
              },
            },
          },
        ],
      },
    ],
  };
}

// Get statistics for all years
export function getYearlyStats(): { year: number; projects: number; initiatives: number; scale: number }[] {
  const stats: { year: number; projects: number; initiatives: number; scale: number }[] = [];

  for (const [year, config] of yearConfigs) {
    stats.push({
      year,
      projects: config.numProjects,
      initiatives: config.numInitiatives,
      scale: config.scale,
    });
  }

  return stats;
}

// Get total counts
export function getTotalCounts() {
  let totalEpics = 0;
  let totalTasks = 0;

  for (let i = 0; i < totalProjectsAllYears; i++) {
    const epicCount = getEpicCountForProject(i);
    totalEpics += epicCount;
    // Estimate tasks (we don't generate all of them)
    const avgTasksPerEpic = (CONFIG.TASKS_PER_EPIC_MIN + CONFIG.TASKS_PER_EPIC_MAX) / 2;
    totalTasks += epicCount * avgTasksPerEpic;
  }

  return {
    totalProjects: totalProjectsAllYears,
    totalInitiatives: totalInitiativesAllYears,
    totalEpics: Math.round(totalEpics),
    totalTasks: Math.round(totalTasks),
    totalUsers: CONFIG.NUM_USERS,
    years: YEARS,
    yearlyBreakdown: getYearlyStats(),
  };
}

// Export constants
export { ISSUE_TYPES, STATUSES, PRIORITIES, WORKSTREAMS, HEALTH_STATUSES, CAPITAL_EXPENSE_OPTIONS, YEARS, totalProjectsAllYears };
