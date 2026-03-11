import * as fs from 'fs';
import * as path from 'path';

// Persistence file path
const DATA_DIR = process.env.MOCK_DATA_DIR || '/data';
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'role-assignments.json');

// Types
export interface RoleRequirement {
  id: string;
  issueKey: string;        // The Jira issue (initiative/epic) this role is for
  roleName: string;        // e.g., "Frontend Developer", "Tech Lead"
  description?: string;
  requiredSkills?: string[];
  estimatedHours?: number;
  priority?: 'high' | 'medium' | 'low';
  createdAt: string;
  updatedAt: string;
}

export interface RoleAssignment {
  id: string;
  roleRequirementId: string;  // Links to RoleRequirement
  issueKey: string;           // Denormalized for easier querying
  roleName: string;           // Denormalized for easier querying
  userId: string;             // Jira user accountId
  userName: string;           // Display name
  userEmail?: string;
  percentage: number;         // Allocation percentage (0-100)
  startDate: string;          // ISO date string
  endDate: string;            // ISO date string
  status: 'active' | 'pending' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface PersistedRoleData {
  roleRequirements: Record<string, RoleRequirement>;
  roleAssignments: Record<string, RoleAssignment>;
  lastUpdated: string;
}

// In-memory stores
let roleRequirements: Map<string, RoleRequirement> = new Map();
let roleAssignments: Map<string, RoleAssignment> = new Map();

// Predefined role templates
export const ROLE_TEMPLATES = [
  'Tech Lead',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'DevOps Engineer',
  'QA Engineer',
  'Data Engineer',
  'Data Scientist',
  'UX Designer',
  'UI Designer',
  'Product Manager',
  'Project Manager',
  'Scrum Master',
  'Business Analyst',
  'Solutions Architect',
  'Security Engineer',
  'Mobile Developer',
  'Cloud Engineer',
  'Database Administrator',
  'Technical Writer',
];

// Ensure data directory exists
function ensureDataDir(): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return true;
  } catch (error) {
    console.warn(`[RoleAssignments] Cannot create data directory ${DATA_DIR}`);
    return false;
  }
}

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Load persisted data
export function loadRoleData(): void {
  if (!ensureDataDir()) return;

  try {
    if (fs.existsSync(ASSIGNMENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ASSIGNMENTS_FILE, 'utf-8')) as PersistedRoleData;
      roleRequirements = new Map(Object.entries(data.roleRequirements || {}));
      roleAssignments = new Map(Object.entries(data.roleAssignments || {}));
      console.log(`[RoleAssignments] Loaded ${roleRequirements.size} role requirements and ${roleAssignments.size} assignments`);
    } else {
      console.log('[RoleAssignments] No persistence file found, starting fresh');
    }
  } catch (error) {
    console.warn('[RoleAssignments] Error loading data:', error);
  }
}

// Save data to file
function saveRoleData(): void {
  if (!ensureDataDir()) return;

  try {
    const data: PersistedRoleData = {
      roleRequirements: Object.fromEntries(roleRequirements),
      roleAssignments: Object.fromEntries(roleAssignments),
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(data, null, 2));
    console.log(`[RoleAssignments] Saved ${roleRequirements.size} requirements and ${roleAssignments.size} assignments`);
  } catch (error) {
    console.warn('[RoleAssignments] Error saving data:', error);
  }
}

// Debounced save
let saveTimeout: NodeJS.Timeout | null = null;
function debouncedSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveRoleData();
    saveTimeout = null;
  }, 1000);
}

// ==================== ROLE REQUIREMENTS ====================

// Get all role requirements for an issue
export function getRoleRequirements(issueKey: string): RoleRequirement[] {
  const results: RoleRequirement[] = [];
  for (const req of roleRequirements.values()) {
    if (req.issueKey === issueKey) {
      results.push(req);
    }
  }
  return results.sort((a, b) => a.roleName.localeCompare(b.roleName));
}

// Get a single role requirement
export function getRoleRequirement(id: string): RoleRequirement | undefined {
  return roleRequirements.get(id);
}

// Create a role requirement
export function createRoleRequirement(
  issueKey: string,
  roleName: string,
  options?: {
    description?: string;
    requiredSkills?: string[];
    estimatedHours?: number;
    priority?: 'high' | 'medium' | 'low';
  }
): RoleRequirement {
  const now = new Date().toISOString();
  const requirement: RoleRequirement = {
    id: generateId(),
    issueKey,
    roleName,
    description: options?.description,
    requiredSkills: options?.requiredSkills,
    estimatedHours: options?.estimatedHours,
    priority: options?.priority || 'medium',
    createdAt: now,
    updatedAt: now,
  };
  roleRequirements.set(requirement.id, requirement);
  debouncedSave();
  console.log(`[RoleAssignments] Created role requirement: ${roleName} for ${issueKey}`);
  return requirement;
}

// Update a role requirement
export function updateRoleRequirement(
  id: string,
  updates: Partial<Omit<RoleRequirement, 'id' | 'createdAt'>>
): RoleRequirement | null {
  const existing = roleRequirements.get(id);
  if (!existing) return null;

  const updated: RoleRequirement = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  roleRequirements.set(id, updated);
  debouncedSave();
  return updated;
}

// Delete a role requirement (and its assignments)
export function deleteRoleRequirement(id: string): boolean {
  const existing = roleRequirements.get(id);
  if (!existing) return false;

  // Delete associated assignments
  for (const [assignId, assignment] of roleAssignments) {
    if (assignment.roleRequirementId === id) {
      roleAssignments.delete(assignId);
    }
  }

  roleRequirements.delete(id);
  debouncedSave();
  console.log(`[RoleAssignments] Deleted role requirement: ${existing.roleName} for ${existing.issueKey}`);
  return true;
}

// ==================== ROLE ASSIGNMENTS ====================

// Get all assignments for an issue
export function getAssignmentsForIssue(issueKey: string): RoleAssignment[] {
  const results: RoleAssignment[] = [];
  for (const assignment of roleAssignments.values()) {
    if (assignment.issueKey === issueKey) {
      results.push(assignment);
    }
  }
  return results.sort((a, b) => a.roleName.localeCompare(b.roleName));
}

// Get all assignments for a role requirement
export function getAssignmentsForRole(roleRequirementId: string): RoleAssignment[] {
  const results: RoleAssignment[] = [];
  for (const assignment of roleAssignments.values()) {
    if (assignment.roleRequirementId === roleRequirementId) {
      results.push(assignment);
    }
  }
  return results;
}

// Get all assignments for a user
export function getAssignmentsForUser(userId: string): RoleAssignment[] {
  const results: RoleAssignment[] = [];
  for (const assignment of roleAssignments.values()) {
    if (assignment.userId === userId) {
      results.push(assignment);
    }
  }
  return results;
}

// Get a single assignment
export function getAssignment(id: string): RoleAssignment | undefined {
  return roleAssignments.get(id);
}

// Create an assignment
export function createAssignment(
  roleRequirementId: string,
  userId: string,
  userName: string,
  startDate: string,
  endDate: string,
  percentage: number,
  options?: {
    userEmail?: string;
    status?: 'active' | 'pending' | 'completed' | 'cancelled';
    notes?: string;
  }
): RoleAssignment | null {
  const requirement = roleRequirements.get(roleRequirementId);
  if (!requirement) {
    console.warn(`[RoleAssignments] Role requirement ${roleRequirementId} not found`);
    return null;
  }

  const now = new Date().toISOString();
  const assignment: RoleAssignment = {
    id: generateId(),
    roleRequirementId,
    issueKey: requirement.issueKey,
    roleName: requirement.roleName,
    userId,
    userName,
    userEmail: options?.userEmail,
    percentage: Math.min(100, Math.max(0, percentage)),
    startDate,
    endDate,
    status: options?.status || 'active',
    notes: options?.notes,
    createdAt: now,
    updatedAt: now,
  };
  roleAssignments.set(assignment.id, assignment);
  debouncedSave();
  console.log(`[RoleAssignments] Created assignment: ${userName} as ${requirement.roleName} for ${requirement.issueKey}`);
  return assignment;
}

// Update an assignment
export function updateAssignment(
  id: string,
  updates: Partial<Omit<RoleAssignment, 'id' | 'createdAt' | 'roleRequirementId' | 'issueKey' | 'roleName'>>
): RoleAssignment | null {
  const existing = roleAssignments.get(id);
  if (!existing) return null;

  const updated: RoleAssignment = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  if (updates.percentage !== undefined) {
    updated.percentage = Math.min(100, Math.max(0, updates.percentage));
  }
  roleAssignments.set(id, updated);
  debouncedSave();
  return updated;
}

// Delete an assignment
export function deleteAssignment(id: string): boolean {
  const existing = roleAssignments.get(id);
  if (!existing) return false;

  roleAssignments.delete(id);
  debouncedSave();
  console.log(`[RoleAssignments] Deleted assignment: ${existing.userName} from ${existing.roleName}`);
  return true;
}

// ==================== AGGREGATION FUNCTIONS ====================

// Get complete role data for an issue (requirements + assignments)
export function getIssueRoleData(issueKey: string): {
  requirements: RoleRequirement[];
  assignments: RoleAssignment[];
  summary: {
    totalRoles: number;
    assignedRoles: number;
    unassignedRoles: number;
    totalAllocation: number;
  };
} {
  const requirements = getRoleRequirements(issueKey);
  const assignments = getAssignmentsForIssue(issueKey);

  const assignedRoleIds = new Set(assignments.map(a => a.roleRequirementId));
  const assignedRoles = requirements.filter(r => assignedRoleIds.has(r.id)).length;

  return {
    requirements,
    assignments,
    summary: {
      totalRoles: requirements.length,
      assignedRoles,
      unassignedRoles: requirements.length - assignedRoles,
      totalAllocation: assignments.reduce((sum, a) => sum + a.percentage, 0),
    },
  };
}

// Get user's total allocation across all assignments
export function getUserTotalAllocation(userId: string, startDate?: string, endDate?: string): number {
  let total = 0;
  for (const assignment of roleAssignments.values()) {
    if (assignment.userId === userId && assignment.status === 'active') {
      // Check date overlap if dates provided
      if (startDate && endDate) {
        const aStart = new Date(assignment.startDate);
        const aEnd = new Date(assignment.endDate);
        const qStart = new Date(startDate);
        const qEnd = new Date(endDate);

        // Check if date ranges overlap
        if (aStart <= qEnd && aEnd >= qStart) {
          total += assignment.percentage;
        }
      } else {
        total += assignment.percentage;
      }
    }
  }
  return total;
}

// Get statistics
export function getRoleAssignmentStats(): {
  totalRequirements: number;
  totalAssignments: number;
  requirementsByIssue: number;
  assignmentsByUser: number;
} {
  const issueSet = new Set<string>();
  const userSet = new Set<string>();

  for (const req of roleRequirements.values()) {
    issueSet.add(req.issueKey);
  }
  for (const assign of roleAssignments.values()) {
    userSet.add(assign.userId);
  }

  return {
    totalRequirements: roleRequirements.size,
    totalAssignments: roleAssignments.size,
    requirementsByIssue: issueSet.size,
    assignmentsByUser: userSet.size,
  };
}

// Clear all role data
export function clearRoleData(): void {
  roleRequirements.clear();
  roleAssignments.clear();
  debouncedSave();
}

// Initialize on module load
loadRoleData();
