// Tempo API Types (v4)

/**
 * User reference - maps to Jira user by accountId
 */
export interface TempoUser {
  accountId: string;
  displayName: string;
  self?: string;
}

/**
 * Issue reference - links to Jira issue
 */
export interface TempoIssue {
  id: number;
  key: string;
  self?: string;
}

/**
 * Worklog - time entry linked to a Jira issue
 */
export interface TempoWorklog {
  tempoWorklogId: number;
  jiraWorklogId?: number;
  issue: TempoIssue;
  timeSpentSeconds: number;
  billableSeconds?: number;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  description: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  author: TempoUser;
  attributes?: {
    key: string;
    value: string;
  }[];
  self?: string;
}

/**
 * Worklog input for creation/update
 */
export interface TempoWorklogInput {
  issueKey: string;
  timeSpentSeconds: number;
  billableSeconds?: number;
  startDate: string;
  startTime?: string;
  description?: string;
  authorAccountId: string;
  attributes?: {
    key: string;
    value: string;
  }[];
}

/**
 * Account - billing/project account
 */
export interface TempoAccount {
  id: number;
  key: string;
  name: string;
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  global: boolean;
  monthlyBudget?: number;
  lead?: TempoUser;
  contact?: TempoUser;
  category?: {
    id: number;
    key: string;
    name: string;
    type?: {
      name: string;
    };
  };
  customer?: {
    id: number;
    key: string;
    name: string;
  };
  links?: {
    self: string;
  };
  self?: string;
}

/**
 * Account input for creation/update
 */
export interface TempoAccountInput {
  key: string;
  name: string;
  status?: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  leadAccountId?: string;
  contactAccountId?: string;
  categoryKey?: string;
  customerKey?: string;
  monthlyBudget?: number;
  global?: boolean;
}

/**
 * Team
 */
export interface TempoTeam {
  id: number;
  name: string;
  summary?: string;
  lead?: TempoUser;
  program?: {
    id: number;
    name: string;
    self?: string;
  };
  links?: {
    self: string;
  };
  self?: string;
}

/**
 * Team input for creation/update
 */
export interface TempoTeamInput {
  name: string;
  summary?: string;
  leadAccountId?: string;
  programId?: number;
}

/**
 * Team member
 */
export interface TempoTeamMember {
  id: number;
  team: {
    id: number;
    name: string;
    self?: string;
  };
  member: TempoUser;
  membership: {
    id: number;
    commitmentPercent?: number;
    from?: string; // YYYY-MM-DD
    to?: string; // YYYY-MM-DD
    role?: {
      id: number;
      name: string;
    };
  };
  self?: string;
}

/**
 * Team member input for creation/update
 */
export interface TempoTeamMemberInput {
  accountId: string;
  commitmentPercent?: number;
  from?: string;
  to?: string;
  roleId?: number;
}

/**
 * Plan - resource allocation
 */
export interface TempoPlan {
  id: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  secondsPerDay: number;
  includeNonWorkingDays: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
  planItem: {
    id: number;
    type: 'ISSUE' | 'PROJECT' | 'ACCOUNT';
    self?: string;
  };
  assignee: TempoUser;
  planApproval?: {
    status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
    reviewer?: TempoUser;
    reviewedAt?: string;
  };
  recurrence?: {
    rule: 'NEVER' | 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY';
    endDate?: string;
  };
  self?: string;
}

/**
 * Plan input for creation/update
 */
export interface TempoPlanInput {
  startDate: string;
  endDate: string;
  secondsPerDay: number;
  includeNonWorkingDays?: boolean;
  description?: string;
  planItemType: 'ISSUE' | 'PROJECT' | 'ACCOUNT';
  planItemId: number;
  assigneeAccountId: string;
  recurrence?: {
    rule: 'NEVER' | 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY';
    endDate?: string;
  };
}

/**
 * Flex Plan - team-level plan
 */
export interface TempoFlexPlan {
  id: number;
  team: {
    id: number;
    name: string;
    self?: string;
  };
  planItem: {
    id: number;
    type: 'ISSUE' | 'PROJECT' | 'ACCOUNT';
    self?: string;
  };
  dates: {
    startDate: string;
    endDate: string;
  };
  rule: {
    percentage?: number;
    secondsPerDay?: number;
  };
  description?: string;
  createdAt: string;
  updatedAt: string;
  self?: string;
}

/**
 * Flex Plan input for creation/update
 */
export interface TempoFlexPlanInput {
  teamId: number;
  planItemType: 'ISSUE' | 'PROJECT' | 'ACCOUNT';
  planItemId: number;
  startDate: string;
  endDate: string;
  percentage?: number;
  secondsPerDay?: number;
  description?: string;
}

/**
 * Paginated response wrapper
 */
export interface TempoPaginatedResponse<T> {
  metadata: {
    count: number;
    offset: number;
    limit: number;
    next?: string;
    previous?: string;
  };
  results: T[];
  self?: string;
}

/**
 * Search request for accounts
 */
export interface TempoAccountSearchRequest {
  keys?: string[];
  statuses?: ('OPEN' | 'CLOSED' | 'ARCHIVED')[];
  leadAccountIds?: string[];
  customerKeys?: string[];
  offset?: number;
  limit?: number;
}

/**
 * Search request for flex plans
 */
export interface TempoFlexPlanSearchRequest {
  teamIds?: number[];
  planItemTypes?: ('ISSUE' | 'PROJECT' | 'ACCOUNT')[];
  from?: string;
  to?: string;
  offset?: number;
  limit?: number;
}

/**
 * Worklog search parameters
 */
export interface TempoWorklogSearchParams {
  from?: string;
  to?: string;
  updatedFrom?: string;
  projectKey?: string[];
  issueKey?: string[];
  accountKey?: string[];
  accountId?: number[];
  user?: string[];
  offset?: number;
  limit?: number;
}

/**
 * Team role
 */
export interface TempoTeamRole {
  id: number;
  name: string;
  default?: boolean;
  self?: string;
}

/**
 * Account category
 */
export interface TempoAccountCategory {
  id: number;
  key: string;
  name: string;
  type?: {
    name: string;
  };
  self?: string;
}

/**
 * Customer
 */
export interface TempoCustomer {
  id: number;
  key: string;
  name: string;
  self?: string;
}

/**
 * Program
 */
export interface TempoProgram {
  id: number;
  name: string;
  manager?: TempoUser;
  teams?: {
    id: number;
    name: string;
    self?: string;
  }[];
  self?: string;
}
