import * as fs from 'fs';
import * as path from 'path';

// Persistence file path - uses /data if available (Docker volume), otherwise local
const DATA_DIR = process.env.MOCK_DATA_DIR || '/data';
const PERSISTENCE_FILE = path.join(DATA_DIR, 'mock-jira-updates.json');

interface PersistedData {
  issueUpdates: Record<string, any>;
  createdIssues: Record<string, any>;
  lastUpdated: string;
}

// In-memory stores
let issueUpdates: Map<string, any> = new Map();
let createdIssues: Map<string, any> = new Map();

// Ensure data directory exists
function ensureDataDir(): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return true;
  } catch (error) {
    console.warn(`[Persistence] Cannot create data directory ${DATA_DIR}, using memory-only mode`);
    return false;
  }
}

// Load persisted data from file
export function loadPersistedData(): void {
  if (!ensureDataDir()) return;

  try {
    if (fs.existsSync(PERSISTENCE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PERSISTENCE_FILE, 'utf-8')) as PersistedData;

      issueUpdates = new Map(Object.entries(data.issueUpdates || {}));
      createdIssues = new Map(Object.entries(data.createdIssues || {}));

      console.log(`[Persistence] Loaded ${issueUpdates.size} issue updates and ${createdIssues.size} created issues from ${PERSISTENCE_FILE}`);
      console.log(`[Persistence] Last updated: ${data.lastUpdated}`);
    } else {
      console.log('[Persistence] No persistence file found, starting fresh');
    }
  } catch (error) {
    console.warn('[Persistence] Error loading persisted data:', error);
  }
}

// Save data to file
function savePersistedData(): void {
  if (!ensureDataDir()) return;

  try {
    const data: PersistedData = {
      issueUpdates: Object.fromEntries(issueUpdates),
      createdIssues: Object.fromEntries(createdIssues),
      lastUpdated: new Date().toISOString(),
    };

    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(data, null, 2));
    console.log(`[Persistence] Saved ${issueUpdates.size} issue updates and ${createdIssues.size} created issues`);
  } catch (error) {
    console.warn('[Persistence] Error saving persisted data:', error);
  }
}

// Debounced save to avoid too many writes
let saveTimeout: NodeJS.Timeout | null = null;
function debouncedSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    savePersistedData();
    saveTimeout = null;
  }, 1000); // Save 1 second after last change
}

// Get issue updates
export function getIssueUpdates(issueKey: string): any | undefined {
  return issueUpdates.get(issueKey);
}

// Set issue updates
export function setIssueUpdates(issueKey: string, updates: any): void {
  const existing = issueUpdates.get(issueKey) || {};
  issueUpdates.set(issueKey, { ...existing, ...updates });
  debouncedSave();
}

// Get all issue updates
export function getAllIssueUpdates(): Map<string, any> {
  return issueUpdates;
}

// Clear issue updates for a specific key
export function clearIssueUpdates(issueKey: string): void {
  issueUpdates.delete(issueKey);
  debouncedSave();
}

// Store created issue
export function storeCreatedIssue(issueKey: string, fields: any): void {
  createdIssues.set(issueKey, {
    ...fields,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });
  debouncedSave();
}

// Get created issue
export function getCreatedIssue(issueKey: string): any | undefined {
  return createdIssues.get(issueKey);
}

// Get all created issues
export function getAllCreatedIssues(): Map<string, any> {
  return createdIssues;
}

// Get statistics
export function getPersistenceStats(): { issueUpdates: number; createdIssues: number; persistenceFile: string } {
  return {
    issueUpdates: issueUpdates.size,
    createdIssues: createdIssues.size,
    persistenceFile: PERSISTENCE_FILE,
  };
}

// Clear all data (useful for testing)
export function clearAllData(): void {
  issueUpdates.clear();
  createdIssues.clear();
  debouncedSave();
}

// Initialize on module load
loadPersistedData();
