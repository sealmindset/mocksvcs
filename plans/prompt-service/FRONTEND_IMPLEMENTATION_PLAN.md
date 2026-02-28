# Frontend Implementation Plan: AI Prompt Management Service

> **Purpose:** Next.js 15 admin UI implementation for prompt management including prompt editor, version history, version diff viewer, search/filter/category browsing, and CRUD operations.
>
> **Phase:** 5 of 8
> **Prerequisites:** Phase 3 (API), Phase 4 (Auth)
> **Duration:** 3-4 days
> **Reference:** Zapper `frontend/src/app/(dashboard)/admin/prompts/`, `frontend/src/components/prompts/`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [TypeScript Types](#3-typescript-types)
4. [API Client Layer](#4-api-client-layer)
5. [React Hooks (TanStack Query)](#5-react-hooks-tanstack-query)
6. [Page Layout](#6-page-layout)
7. [Components](#7-components)
8. [State Management](#8-state-management)
9. [Styling and Theme](#9-styling-and-theme)
10. [Validation Checklist](#10-validation-checklist)

---

## 1. Architecture Overview

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router) | React 19, SSR/SSG |
| Components | shadcn/ui + Radix UI | Accessible primitives |
| Styling | Tailwind CSS 3.4 | Utility-first CSS |
| Data | TanStack Query v5 | Server state, caching, mutations |
| Tables | TanStack Table v8 | Data grid (prompt list) |
| Forms | React Hook Form + Zod | Form state + validation |
| Diff | diff (npm) | Side-by-side version comparison |
| Icons | Lucide React | SVG icon library |
| Notifications | Sonner | Toast notifications |

### Application Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Admin Layout (AppShell)                      │
│  ┌──────────┐  ┌──────────────────────────────────────────────┐ │
│  │ Sidebar  │  │              Main Content                     │ │
│  │          │  │  ┌────────────────────────────────────────┐  │ │
│  │ - Home   │  │  │         Prompts Page (3-column)        │  │ │
│  │ - Prompts│  │  │                                        │  │ │
│  │ - API    │  │  │  [Filter/List] [Editor] [History/Diff] │  │ │
│  │   Keys   │  │  │                                        │  │ │
│  │ - Audit  │  │  └────────────────────────────────────────┘  │ │
│  │   Log    │  │                                              │ │
│  └──────────┘  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout (providers, theme)
│   │   ├── page.tsx                      # Home → redirect to /prompts
│   │   ├── globals.css                   # Tailwind base styles
│   │   ├── login/
│   │   │   └── page.tsx                  # Login page (API key or OIDC)
│   │   ├── prompts/
│   │   │   └── page.tsx                  # Main prompt management page
│   │   ├── api-keys/
│   │   │   └── page.tsx                  # API key management
│   │   └── audit-log/
│   │       └── page.tsx                  # Audit log viewer
│   ├── components/
│   │   ├── ui/                           # shadcn/ui primitives
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── select.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── toast.tsx (sonner)
│   │   │   └── tooltip.tsx
│   │   ├── layout/
│   │   │   ├── app-shell.tsx             # Sidebar + main content layout
│   │   │   ├── sidebar.tsx               # Navigation sidebar
│   │   │   └── page-header.tsx           # Page title + breadcrumbs
│   │   └── prompts/
│   │       ├── prompt-list.tsx           # Left panel: filterable prompt list
│   │       ├── prompt-editor.tsx         # Center panel: content editor
│   │       ├── version-history.tsx       # Right panel: version list
│   │       ├── version-diff.tsx          # Right panel: diff viewer
│   │       ├── prompt-create-dialog.tsx  # Create new prompt modal
│   │       ├── template-variables.tsx    # Extracted {{ var }} display
│   │       └── prompt-filters.tsx        # Search, type, consumer, category filters
│   ├── hooks/
│   │   ├── use-prompts.ts               # TanStack Query hooks for prompts API
│   │   ├── use-api-keys.ts              # TanStack Query hooks for API keys
│   │   └── use-audit-log.ts             # TanStack Query hooks for audit log
│   ├── lib/
│   │   ├── api.ts                        # Fetch wrapper with auth headers
│   │   ├── utils.ts                      # cn(), formatDate(), etc.
│   │   └── constants.ts                  # Consumer IDs, categories, types
│   └── types/
│       ├── prompt.ts                     # Prompt, PromptVersion, PromptSummary
│       ├── api-key.ts                    # ApiKey types
│       └── audit-log.ts                  # AuditLog types
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── Dockerfile
```

---

## 3. TypeScript Types

```typescript
// src/types/prompt.ts

export type PromptType = "system" | "instruction" | "tooling" | "template";

export interface Prompt {
  id: string;
  api_id: number;
  slug: string;
  title: string;
  type: PromptType;
  consumer_id: string;
  content: string;
  description: string | null;
  version: number;
  is_active: boolean;
  updated_by: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptSummary {
  id: string;
  api_id: number;
  slug: string;
  title: string;
  type: PromptType;
  consumer_id: string;
  version: number;
  is_active: boolean;
  updated_by: string | null;
  category: string | null;
  updated_at: string;
}

export interface PromptVersion {
  id: string;
  api_id: number;
  prompt_id: string;
  version: number;
  title: string;
  type: PromptType;
  consumer_id: string;
  content: string;
  description: string | null;
  updated_by: string | null;
  created_at: string;
}

export interface PromptCreate {
  slug: string;
  title: string;
  type: PromptType;
  consumer_id: string;
  content: string;
  description?: string;
}

export interface PromptUpdate {
  title?: string;
  type?: PromptType;
  consumer_id?: string;
  content?: string;
  description?: string;
  is_active?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// Constants
export const PROMPT_TYPES: PromptType[] = [
  "system", "instruction", "tooling", "template"
];

export const PROMPT_CATEGORIES = [
  "ai", "system", "template", "report", "writeup", "tool"
];

// Consumer IDs are project-specific — configure per deployment
export const DEFAULT_CONSUMER_IDS = [
  "default", "orchestrator", "analyzer", "generator", "classifier"
];
```

---

## 4. API Client Layer

```typescript
// src/lib/api.ts

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, String(value));
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  // API key from cookie or session
  const apiKey = getStoredApiKey();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(url, { ...fetchOptions, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new ApiError(response.status, error.detail || "Request failed");
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
```

---

## 5. React Hooks (TanStack Query)

```typescript
// src/hooks/use-prompts.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  Prompt, PromptSummary, PromptVersion, PromptCreate,
  PromptUpdate, PaginatedResponse
} from "@/types/prompt";

// ─── Queries ────────────────────────────────────────────────

export function usePrompts(filters: {
  page?: number;
  size?: number;
  type?: string;
  consumer_id?: string;
  category?: string;
  search?: string;
  is_active?: boolean;
} = {}) {
  return useQuery({
    queryKey: ["prompts", filters],
    queryFn: () =>
      apiFetch<PaginatedResponse<PromptSummary>>("/prompts", {
        params: { page: 1, size: 50, ...filters },
      }),
  });
}

export function usePrompt(id: string | null) {
  return useQuery({
    queryKey: ["prompt", id],
    queryFn: () => apiFetch<Prompt>(`/prompts/${id}`),
    enabled: !!id,
  });
}

export function usePromptVersions(id: string | null) {
  return useQuery({
    queryKey: ["prompt-versions", id],
    queryFn: () => apiFetch<PromptVersion[]>(`/prompts/${id}/versions`),
    enabled: !!id,
  });
}

export function usePromptVersion(id: string | null, version: number | null) {
  return useQuery({
    queryKey: ["prompt-version", id, version],
    queryFn: () => apiFetch<PromptVersion>(`/prompts/${id}/versions/${version}`),
    enabled: !!id && !!version,
  });
}

// ─── Mutations ──────────────────────────────────────────────

export function useCreatePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PromptCreate) =>
      apiFetch<Prompt>("/prompts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

export function useUpdatePrompt(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PromptUpdate) =>
      apiFetch<Prompt>(`/prompts/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      queryClient.invalidateQueries({ queryKey: ["prompt", id] });
      queryClient.invalidateQueries({ queryKey: ["prompt-versions", id] });
    },
  });
}

export function useDeletePrompt(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Prompt>(`/prompts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

export function useRestorePromptVersion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      apiFetch<Prompt>(`/prompts/${id}/restore`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      queryClient.invalidateQueries({ queryKey: ["prompt", id] });
      queryClient.invalidateQueries({ queryKey: ["prompt-versions", id] });
    },
  });
}
```

---

## 6. Page Layout

### 6.1 Main Prompts Page (Three-Column Layout)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Page Header: "AI Prompt Management"                  [+ New Prompt]    │
├──────────────┬─────────────────────────────┬────────────────────────────┤
│              │                             │                            │
│  COLUMN 1    │  COLUMN 2                   │  COLUMN 3                  │
│  (300px)     │  (flex-1)                   │  (350px)                   │
│              │                             │                            │
│  ┌─────────┐ │  ┌─────────────────────────┐│  ┌──────────────────────┐ │
│  │ Search  │ │  │ Metadata Bar            ││  │ Version History      │ │
│  └─────────┘ │  │ slug | type | v3 | user ││  │                      │ │
│              │  └─────────────────────────┘│  │ v3 (current) ▸       │ │
│  ┌─────────┐ │  ┌─────────────────────────┐│  │ v2            [↩]   │ │
│  │Category │ │  │                         ││  │ v1            [↩]   │ │
│  │  Tabs   │ │  │   Prompt Content        ││  │                      │ │
│  └─────────┘ │  │   (monospace textarea)  ││  └──────────────────────┘ │
│              │  │                         ││                            │
│  ┌─────────┐ │  │                         ││  ┌──────────────────────┐ │
│  │ Type    │ │  │                         ││  │ Version Diff         │ │
│  │ Filter  │ │  │                         ││  │                      │ │
│  └─────────┘ │  │                         ││  │ - removed line       │ │
│              │  │                         ││  │ + added line         │ │
│  ┌─────────┐ │  └─────────────────────────┘│  │                      │ │
│  │Consumer │ │  ┌─────────────────────────┐│  └──────────────────────┘ │
│  │ Filter  │ │  │ Template Variables      ││                            │
│  └─────────┘ │  │ {{ title }}             ││                            │
│              │  │ {{ severity }}           ││                            │
│  ┌─────────┐ │  └─────────────────────────┘│                            │
│  │         │ │                             │                            │
│  │ Prompt  │ │  ┌──────────┬──────────────┐│                            │
│  │ List    │ │  │ [Save]   │ [Duplicate]  ││                            │
│  │         │ │  └──────────┴──────────────┘│                            │
│  │ ▸ item  │ │                             │                            │
│  │   item  │ │                             │                            │
│  │   item  │ │                             │                            │
│  └─────────┘ │                             │                            │
│              │                             │                            │
└──────────────┴─────────────────────────────┴────────────────────────────┘
```

### 6.2 Page Component Structure

```typescript
// src/app/prompts/page.tsx
"use client";

import { useState } from "react";
import { PromptList } from "@/components/prompts/prompt-list";
import { PromptEditor } from "@/components/prompts/prompt-editor";
import { VersionHistory } from "@/components/prompts/version-history";
import { VersionDiff } from "@/components/prompts/version-diff";
import { PromptCreateDialog } from "@/components/prompts/prompt-create-dialog";
import { PageHeader } from "@/components/layout/page-header";

export default function PromptsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diffVersion, setDiffVersion] = useState<number | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [consumerFilter, setConsumerFilter] = useState<string | undefined>();
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="AI Prompt Management"
        action={<PromptCreateDialog />}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Column 1: Filters + List */}
        <div className="w-[300px] border-r flex flex-col">
          <PromptList
            selectedId={selectedId}
            onSelect={setSelectedId}
            search={search}
            onSearchChange={setSearch}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            consumerFilter={consumerFilter}
            onConsumerFilterChange={setConsumerFilter}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
          />
        </div>

        {/* Column 2: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <PromptEditor promptId={selectedId} />
        </div>

        {/* Column 3: History + Diff */}
        <div className="w-[350px] border-l flex flex-col">
          <VersionHistory
            promptId={selectedId}
            onSelectDiff={setDiffVersion}
          />
          {diffVersion && selectedId && (
            <VersionDiff
              promptId={selectedId}
              version={diffVersion}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 7. Components

### 7.1 PromptList

**Location:** `src/components/prompts/prompt-list.tsx`

**Features:**
- Search input at top (debounced, case-insensitive)
- Category tabs (All, AI, System, Template, Report, ...)
- Type filter dropdown (system, instruction, tooling, template)
- Consumer filter dropdown (project-specific consumer IDs)
- Scrollable list of prompt summaries
- Each item shows: title, slug (muted), type badge, version number, last updated
- Selected item highlighted
- Groups prompts by category with section headers

**Props:**
```typescript
interface PromptListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter?: string;
  onTypeFilterChange: (value?: string) => void;
  consumerFilter?: string;
  onConsumerFilterChange: (value?: string) => void;
  categoryFilter?: string;
  onCategoryFilterChange: (value?: string) => void;
}
```

### 7.2 PromptEditor

**Location:** `src/components/prompts/prompt-editor.tsx`

**Features:**
- Metadata bar: slug (readonly), type badge, version number, consumer_id, active status
- Large monospace textarea for prompt content
- Description field (optional, collapsible)
- Template Variables panel (extracts `{{ var }}` from content)
- Save button (creates new version on change)
- Duplicate button (opens create dialog pre-filled)
- Deactivate/Reactivate button (admin only)
- Last updated by + timestamp

**Template Variable Extraction:**
```typescript
function extractTemplateVariables(content: string): string[] {
  const matches = content.match(/\{\{\s*(\w+)\s*\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/[{}\s]/g, "")))].sort();
}
```

### 7.3 VersionHistory

**Location:** `src/components/prompts/version-history.tsx`

**Features:**
- Scrollable list of all versions (newest first)
- Each row: version number, author, relative timestamp
- "Current" badge on latest version
- Click to view version content (read-only in editor)
- Restore button on non-current versions
- Restore confirmation dialog
- Click to show diff (sets diffVersion state)

**Props:**
```typescript
interface VersionHistoryProps {
  promptId: string | null;
  onSelectDiff: (version: number | null) => void;
}
```

### 7.4 VersionDiff

**Location:** `src/components/prompts/version-diff.tsx`

**Features:**
- Side-by-side diff using `diff` npm library
- Color-coded: green background for additions, red for removals
- Header: "v{old} → v{current}"
- Line numbers
- Scrollable for long prompts

**Implementation Pattern:**
```typescript
import { diffLines, Change } from "diff";

function renderDiff(oldContent: string, newContent: string): Change[] {
  return diffLines(oldContent, newContent);
}
```

### 7.5 PromptCreateDialog

**Location:** `src/components/prompts/prompt-create-dialog.tsx`

**Features:**
- Modal dialog triggered by "+ New Prompt" button
- Form fields: slug (validated pattern), title, type (select), consumer_id (select/input), content (textarea), description (optional)
- Slug auto-generated from title (slugify)
- Form validation via Zod + React Hook Form
- Submit calls useCreatePrompt mutation
- Success toast + auto-select new prompt

### 7.6 TemplateVariables

**Location:** `src/components/prompts/template-variables.tsx`

**Features:**
- Displays extracted `{{ variable }}` names as badges
- Shows count of variables
- Collapsible panel when no variables present

---

## 8. State Management

### 8.1 Server State (TanStack Query)

| Query Key | Endpoint | Staleness |
|-----------|----------|-----------|
| `["prompts", filters]` | GET `/prompts` | 30s |
| `["prompt", id]` | GET `/prompts/{id}` | 30s |
| `["prompt-versions", id]` | GET `/prompts/{id}/versions` | 30s |
| `["prompt-version", id, v]` | GET `/prompts/{id}/versions/{v}` | 60s |

### 8.2 Client State (useState)

| State | Type | Purpose |
|-------|------|---------|
| `selectedId` | `string \| null` | Currently selected prompt |
| `diffVersion` | `number \| null` | Version being diffed |
| `search` | `string` | Search input value |
| `typeFilter` | `string \| undefined` | Type filter |
| `consumerFilter` | `string \| undefined` | Consumer filter |
| `categoryFilter` | `string \| undefined` | Category filter |

### 8.3 Mutation Side Effects

All mutations invalidate related query keys to ensure fresh data:

```
Create prompt  → invalidate ["prompts"]
Update prompt  → invalidate ["prompts"], ["prompt", id], ["prompt-versions", id]
Delete prompt  → invalidate ["prompts"]
Restore version → invalidate ["prompts"], ["prompt", id], ["prompt-versions", id]
```

---

## 9. Styling and Theme

### 9.1 Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

### 9.2 Key Styling Patterns

| Element | Style |
|---------|-------|
| Prompt content textarea | `font-mono text-sm`, min-height: 400px |
| Type badges | Color-coded: system=blue, instruction=green, tooling=orange, template=purple |
| Diff additions | `bg-green-50 dark:bg-green-950 text-green-800` |
| Diff removals | `bg-red-50 dark:bg-red-950 text-red-800` |
| Selected list item | `bg-accent text-accent-foreground` |
| Version "Current" badge | `bg-primary text-primary-foreground text-xs` |
| Template variable badges | `bg-muted text-muted-foreground font-mono text-xs` |

---

## 10. Validation Checklist

### Page Layout

- [ ] Three-column layout renders correctly at 1280px+ width
- [ ] Columns are independently scrollable
- [ ] Responsive: columns stack on smaller screens

### Prompt List

- [ ] Search filters prompts by slug and title (debounced)
- [ ] Category tabs filter correctly
- [ ] Type and consumer dropdowns filter correctly
- [ ] Selected prompt highlighted
- [ ] Empty state shown when no results

### Prompt Editor

- [ ] Displays full prompt content in monospace textarea
- [ ] Metadata bar shows slug, type, version, consumer, active status
- [ ] Save creates new version (version number increments)
- [ ] Duplicate opens create dialog pre-filled with content
- [ ] Template variables extracted and displayed
- [ ] Deactivate button soft-deletes prompt

### Version History

- [ ] Lists all versions newest-first
- [ ] "Current" badge on latest version
- [ ] Clicking version shows its content (read-only)
- [ ] Restore button creates new version with historical content
- [ ] Restore confirmation dialog prevents accidental restores

### Version Diff

- [ ] Side-by-side diff renders correctly
- [ ] Additions highlighted green, removals highlighted red
- [ ] Header shows version comparison (e.g., "v2 → v3")
- [ ] Long diffs are scrollable

### Create Dialog

- [ ] Slug validation: lowercase, hyphens only, no spaces
- [ ] Required fields enforced: slug, title, type, consumer_id, content
- [ ] Success: toast notification, prompt list refreshed, new prompt selected
- [ ] Error: duplicate slug shows 409 error message

### Data Flow

- [ ] TanStack Query caches prevent unnecessary refetches
- [ ] Mutations invalidate correct query keys
- [ ] Optimistic updates provide responsive UI feel
- [ ] Loading states shown during data fetching
- [ ] Error states shown on API failure
