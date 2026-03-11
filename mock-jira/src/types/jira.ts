// Jira API Types

export interface JiraUser {
  accountId: string;
  accountType: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
  timeZone: string;
  locale: string;
  avatarUrls: {
    '48x48': string;
    '24x24': string;
    '16x16': string;
    '32x32': string;
  };
  self: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  lead: JiraUser;
  projectTypeKey: string;
  simplified: boolean;
  style: string;
  isPrivate: boolean;
  avatarUrls: {
    '48x48': string;
    '24x24': string;
    '16x16': string;
    '32x32': string;
  };
  self: string;
  issueTypes?: JiraIssueType[];
}

export interface JiraIssueType {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  subtask: boolean;
  hierarchyLevel: number;
  self: string;
}

export interface JiraStatus {
  id: string;
  name: string;
  description: string;
  statusCategory: {
    id: number;
    key: string;
    colorName: string;
    name: string;
    self: string;
  };
  self: string;
}

export interface JiraPriority {
  id: string;
  name: string;
  iconUrl: string;
  self: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: any;
    status: JiraStatus;
    assignee?: JiraUser;
    reporter?: JiraUser;
    priority: JiraPriority;
    issuetype: JiraIssueType;
    project: {
      id: string;
      key: string;
      name: string;
      self: string;
    };
    parent?: {
      id: string;
      key: string;
      self: string;
      fields: {
        summary: string;
        status: JiraStatus;
        issuetype: JiraIssueType;
      };
    };
    created: string;
    updated: string;
    duedate?: string;
    labels: string[];
    // Custom fields
    [key: string]: any;
  };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraStatus;
  hasScreen: boolean;
  isGlobal: boolean;
  isInitial: boolean;
  isConditional: boolean;
}

export interface PagedResponse<T> {
  startAt: number;
  maxResults: number;
  total: number;
  isLast: boolean;
  values: T[];
}

export interface SearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}
