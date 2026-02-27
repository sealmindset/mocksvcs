# Phase 6: Frontend Implementation Plan

> **Purpose:** Implement a production-grade Next.js frontend with shadcn/ui, Tailwind CSS, authentication, multi-tenancy, and comprehensive UI patterns. This plan provides complete, copy-paste-ready code templates for every major frontend component, from project initialization through data tables, forms, dashboards, and performance optimization.
>
> **Reference Implementation:** [AuditGH](../README.md) -- all patterns, component structures, hooks, and architectural decisions are derived from AuditGH's production Next.js application.

---

## Placeholder Legend

| Placeholder | Description | Example (AuditGH) |
|---|---|---|
| `{PROJECT_NAME}` | Lowercase project identifier, used in directories and package names | `auditgh` |
| `{PROJECT_TITLE}` | Human-readable project title for UI and docs | `AuditGH Security Portal` |
| `{PROJECT_DESCRIPTION}` | One-line description for README and package.json | `Comprehensive security scanning and remediation platform` |
| `{API_PORT}` | Backend API port | `8000` |
| `{UI_PORT}` | Frontend UI port | `3000` |
| `{API_BASE_URL}` | Backend API base URL for development | `http://localhost:8000` |
| `{DOMAIN_ENTITY}` | Primary domain entity (singular) | `Repository`, `Asset`, `Finding` |
| `{DOMAIN_ENTITIES}` | Primary domain entities (plural) | `Repositories`, `Assets`, `Findings` |
| `{AUTH_PROVIDER}` | Authentication provider name | `Entra ID`, `Okta`, `Auth0` |
| `{PRIMARY_COLOR}` | Primary brand color for theme | `blue`, `indigo`, `purple` |
| `{FEATURE_MODULE}` | Feature-specific module name | `findings`, `repositories`, `assets` |

---

## Prerequisites

Before starting frontend implementation:

1. Backend API is running and accessible at `{API_BASE_URL}`
2. Node.js 20+ and npm/yarn/pnpm installed
3. `/auth/me`, `/auth/login`, `/auth/logout` endpoints implemented
4. CORS configured on backend to allow `http://localhost:{UI_PORT}`

---

## Directory Structure

```
src/web-ui/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth layout group
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/              # Dashboard layout group
│   │   ├── layout.tsx            # Sidebar layout
│   │   ├── page.tsx              # Dashboard home
│   │   ├── {FEATURE_MODULE}/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Global styles
│   ├── loading.tsx               # Global loading state
│   ├── error.tsx                 # Global error boundary
│   └── not-found.tsx             # 404 page
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── dashboard/                # Dashboard widgets
│   ├── forms/                    # Form components
│   ├── tables/                   # Data table components
│   ├── auth-shell.tsx            # Auth wrapper
│   ├── app-sidebar.tsx           # Main sidebar
│   ├── user-nav.tsx              # User navigation
│   ├── theme-provider.tsx        # Dark mode provider
│   └── breadcrumbs.tsx           # Breadcrumb navigation
├── contexts/
│   ├── AuthContext.tsx           # Authentication state
│   └── TenantContext.tsx         # Multi-tenant state
├── hooks/
│   ├── useMobile.ts              # Mobile detection
│   ├── useDashboardLayout.ts    # Dashboard layout state
│   └── useWidgetData.ts          # Widget data fetching
├── lib/
│   ├── api.ts                    # API client utilities
│   ├── utils.ts                  # Class name utilities
│   ├── rbac.ts                   # Role-based access control
│   └── validators.ts             # Zod schemas
├── types/
│   └── index.ts                  # TypeScript definitions
├── next.config.ts                # Next.js configuration
├── tailwind.config.ts            # Tailwind configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies
├── components.json               # shadcn/ui config
└── .env.local                    # Environment variables
```

---

## Section 1: Next.js App Router Setup

### 1.1 Project Initialization

```bash
# Navigate to project root
cd src/

# Create Next.js application
npx create-next-app@latest web-ui --typescript --tailwind --app --no-src-dir --import-alias "@/*"

cd web-ui
```

### 1.2 Install Core Dependencies

**File:** `src/web-ui/package.json`

```json
{
  "name": "{PROJECT_NAME}-web-ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port {UI_PORT}",
    "build": "next build",
    "start": "next start --port {UI_PORT}",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-collapsible": "^1.1.11",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-radio-group": "^1.2.3",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-toast": "^1.1.5",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@tanstack/react-table": "^8.21.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "js-cookie": "^3.0.5",
    "lucide-react": "^0.555.0",
    "next": "16.0.6",
    "next-themes": "^0.2.1",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "react-hook-form": "^7.54.2",
    "recharts": "^3.5.1",
    "sonner": "^1.7.2",
    "tailwind-merge": "^3.4.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@tailwindcss/typography": "^0.5.10",
    "@types/js-cookie": "^3.0.6",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.0.6",
    "tailwindcss": "^4",
    "typescript": "5.9.3"
  }
}
```

### 1.3 Next.js Configuration

**File:** `src/web-ui/next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Rewrites for API proxy in development (optional)
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            source: "/api/:path*",
            destination: "{API_BASE_URL}/:path*",
          },
        ]
      : [];
  },

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },

  // Experimental features
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;
```

### 1.4 TypeScript Configuration

**File:** `src/web-ui/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 1.5 Environment Variables

**File:** `src/web-ui/.env.local`

```bash
# API Configuration
NEXT_PUBLIC_API_URL={API_BASE_URL}

# Application Configuration
NEXT_PUBLIC_APP_NAME={PROJECT_TITLE}
NEXT_PUBLIC_APP_VERSION=0.1.0

# Feature Flags (optional)
NEXT_PUBLIC_ENABLE_DARK_MODE=true
NEXT_PUBLIC_ENABLE_MULTI_TENANT=true
```

### 1.6 Root Layout

**File:** `src/web-ui/app/layout.tsx`

```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthShell } from "@/components/auth-shell";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "{PROJECT_TITLE}",
    template: `%s | {PROJECT_TITLE}`,
  },
  description: "{PROJECT_DESCRIPTION}",
  keywords: ["{PROJECT_NAME}", "security", "platform"],
  authors: [{ name: "{AUTHOR_NAME}" }],
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <AuthShell>{children}</AuthShell>
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

---

## Section 2: Tailwind CSS & Theme Configuration

### 2.1 Tailwind Configuration

**File:** `src/web-ui/tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-in-from-top": {
          from: { transform: "translateY(-10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-from-bottom": {
          from: { transform: "translateY(10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "fade-out": "fade-out 0.2s ease-out",
        "slide-in-from-top": "slide-in-from-top 0.2s ease-out",
        "slide-in-from-bottom": "slide-in-from-bottom 0.2s ease-out",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
```

### 2.2 Global Styles with CSS Variables

**File:** `src/web-ui/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Light mode colors */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;

    /* Sidebar colors */
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 221.2 83.2% 53.3%;
    --sidebar-primary-foreground: 210 40% 98%;
    --sidebar-accent: 220 14.3% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 220 13% 91%;
    --sidebar-ring: 221.2 83.2% 53.3%;
  }

  .dark {
    /* Dark mode colors */
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;

    /* Sidebar colors - dark mode */
    --sidebar-background: 240 5.9% 10%;
    --sidebar-foreground: 240 4.8% 95.9%;
    --sidebar-primary: 224.3 76.3% 48%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 3.7% 15.9%;
    --sidebar-accent-foreground: 240 4.8% 95.9%;
    --sidebar-border: 240 3.7% 15.9%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}

@layer utilities {
  .step {
    counter-increment: step;
  }

  .step:before {
    @apply absolute w-9 h-9 bg-muted rounded-full font-mono font-medium text-center text-base inline-flex items-center justify-center -indent-px border-4 border-background;
    @apply ml-[-50px] mt-[-4px];
    content: counter(step);
  }
}

/* Scrollbar styling */
@layer utilities {
  .scrollbar-thin::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    @apply bg-transparent;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    @apply bg-border rounded-full;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    @apply bg-border/80;
  }
}

/* Print styles */
@media print {
  .no-print {
    display: none !important;
  }
}
```

---

## Section 3: shadcn/ui Setup

### 3.1 Initialize shadcn/ui

```bash
npx shadcn@latest init
```

When prompted:
- TypeScript: Yes
- Style: Default
- Base color: {PRIMARY_COLOR}
- CSS variables: Yes

**File:** `src/web-ui/components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "{PRIMARY_COLOR}",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### 3.2 Install Core shadcn/ui Components

```bash
# Install all essential components at once
npx shadcn@latest add button card input label \
  select checkbox switch textarea \
  dialog sheet alert-dialog \
  dropdown-menu popover tooltip \
  table separator badge \
  avatar scroll-area tabs \
  toast sidebar collapsible
```

### 3.3 Utility Functions

**File:** `src/web-ui/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to localized string
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return formatDate(d);
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
  return str.length > length ? `${str.substring(0, length)}...` : str;
}

/**
 * Generate initials from name
 */
export function getInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Format number with thousands separator
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 3.4 Theme Provider

**File:** `src/web-ui/components/theme-provider.tsx`

```typescript
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

---

## Section 4: Authentication Integration

### 4.1 Authentication Context (Full Implementation)

**File:** `src/web-ui/contexts/AuthContext.tsx`

```typescript
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { API_BASE } from "@/lib/api";
import { meetsMinimumRole, type RoleName } from "@/lib/rbac";

// ── Types ──────────────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: RoleName;
  access_type: string;
  is_break_glass: boolean;
  avatar_url?: string;
  organization?: string;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Returns true when the current user meets at least `minimumRole`. */
  hasRole: (minimumRole: RoleName) => boolean;
  /** Signs out and redirects to /login. */
  logout: () => Promise<void>;
  /** Re-fetches /auth/me (e.g. after role change). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────

const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setUser({
          sub: data.sub ?? data.id ?? "",
          email: data.email ?? "",
          name: data.name ?? data.email ?? "",
          role: data.role ?? "user",
          access_type: data.access_type ?? "full",
          is_break_glass: data.is_break_glass ?? false,
          avatar_url: data.avatar_url,
          organization: data.organization,
        });
        setStatus("authenticated");
      } else if (res.status === 401) {
        setUser(null);
        setStatus("unauthenticated");
      } else {
        // Unexpected status – don't change state to avoid logout loops
        console.warn(`[auth] /auth/me returned ${res.status}`);
      }
    } catch (err) {
      // Network error – log but don't change state (prevents logout loops)
      console.warn("[auth] failed to reach /auth/me", err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Periodic session check
  useEffect(() => {
    intervalRef.current = setInterval(fetchMe, SESSION_CHECK_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMe]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { credentials: "include" });
    } catch {
      // Best-effort – redirect regardless
    }
    setUser(null);
    setStatus("unauthenticated");
    window.location.href = "/login";
  }, []);

  const hasRole = useCallback(
    (minimumRole: RoleName) => {
      if (!user) return false;
      return meetsMinimumRole(user.role, minimumRole);
    },
    [user],
  );

  const value: AuthContextValue = {
    user,
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    hasRole,
    logout,
    refreshUser: fetchMe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
```

### 4.2 Auth Shell Component

**File:** `src/web-ui/components/auth-shell.tsx`

```typescript
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const PUBLIC_ROUTES = ["/login", "/register", "/forgot-password"];

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    if (!isAuthenticated && !isPublicRoute) {
      // Redirect to login with return URL
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    } else if (isAuthenticated && isPublicRoute) {
      // Redirect authenticated users away from login
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

### 4.3 Login Page (Full Implementation)

**File:** `src/web-ui/app/login/page.tsx`

```typescript
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { AlertCircle, Shield } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

function LoginForm() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";

  const [showBreakGlass, setShowBreakGlass] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already authenticated, redirect away from login
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  const handlePrimaryLogin = () => {
    window.location.href = `${API_BASE}/auth/login/{AUTH_PROVIDER}`;
  };

  const handleBreakGlassLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);

      const res = await fetch(`${API_BASE}/auth/break-glass/login`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (res.ok) {
        window.location.href = redirectTo;
      } else {
        const data = await res.json();
        setError(data.detail || "Invalid credentials");
      }
    } catch (err) {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Don't render the login form if already authenticated
  if (!isLoading && isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-{PRIMARY_COLOR}-50 to-{PRIMARY_COLOR}-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Shield className="h-12 w-12 text-{PRIMARY_COLOR}-600" />
          </div>
          <CardTitle className="text-3xl font-bold">{PROJECT_TITLE}</CardTitle>
          <CardDescription className="text-base">
            {PROJECT_DESCRIPTION}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!showBreakGlass ? (
            <>
              {/* Normal Login */}
              <div className="space-y-4">
                <Button
                  onClick={handlePrimaryLogin}
                  className="w-full bg-{PRIMARY_COLOR}-600 hover:bg-{PRIMARY_COLOR}-700 text-white py-6 text-lg"
                  size="lg"
                >
                  Sign in with {AUTH_PROVIDER}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-300" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-gray-800 px-2 text-gray-500">
                      Need help?
                    </span>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Don't have access? Contact your administrator for an
                    invitation.
                  </p>
                  <button
                    onClick={() => setShowBreakGlass(true)}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    Emergency Access
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Break Glass Login */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-900 dark:text-red-300 mb-1">
                    Emergency Break Glass Access
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400">
                    This is emergency access only. All actions will be audited
                    and logged.
                  </p>
                </div>
              </div>

              <form onSubmit={handleBreakGlassLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Local Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <Button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    disabled={loading}
                  >
                    {loading ? "Signing In..." : "Sign In (Emergency Access)"}
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      setShowBreakGlass(false);
                      setError("");
                      setEmail("");
                      setPassword("");
                    }}
                    className="w-full"
                    variant="outline"
                    disabled={loading}
                  >
                    Back to Normal Login
                  </Button>
                </div>
              </form>
            </>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              By signing in, you agree to our security policies and terms of
              use.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

### 4.4 Role-Based Access Control

**File:** `src/web-ui/lib/rbac.ts`

```typescript
export type RoleName = "user" | "analyst" | "engineer" | "admin";

const ROLE_HIERARCHY: Record<RoleName, number> = {
  user: 0,
  analyst: 1,
  engineer: 2,
  admin: 3,
};

/**
 * Check if a user's role meets the minimum required role
 */
export function meetsMinimumRole(
  userRole: RoleName,
  minimumRole: RoleName,
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Get the required role for a given path
 */
export function requiredRoleForPath(path: string): RoleName {
  if (path.startsWith("/settings") || path.startsWith("/admin")) return "admin";
  if (path.startsWith("/api-audit")) return "engineer";
  if (path.startsWith("/findings") || path.startsWith("/repositories"))
    return "analyst";
  return "user";
}

/**
 * Role badge variant mapping
 */
export function getRoleBadgeVariant(
  role: RoleName,
): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case "admin":
      return "destructive";
    case "engineer":
      return "default";
    case "analyst":
      return "secondary";
    default:
      return "outline";
  }
}
```

---

## Section 5: Multi-Tenant Support

### 5.1 Tenant Context

**File:** `src/web-ui/contexts/TenantContext.tsx`

```typescript
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { API_BASE } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
}

interface TenantContextValue {
  tenants: Tenant[];
  currentTenant: Tenant | null;
  isLoading: boolean;
  setCurrentTenant: (tenantId: string) => void;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Fetch available tenants
  useEffect(() => {
    async function fetchTenants() {
      try {
        const res = await fetch(`${API_BASE}/tenants`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setTenants(data);

          // Set current tenant from URL or default to first
          const orgParam = searchParams.get("org");
          if (orgParam) {
            const tenant = data.find((t: Tenant) => t.slug === orgParam);
            setCurrentTenantState(tenant || data[0]);
          } else {
            setCurrentTenantState(data[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch tenants:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTenants();
  }, [searchParams]);

  // Update URL when tenant changes
  const setCurrentTenant = useCallback(
    (tenantId: string) => {
      const tenant = tenants.find((t) => t.id === tenantId);
      if (tenant) {
        setCurrentTenantState(tenant);
        const params = new URLSearchParams(searchParams.toString());
        params.set("org", tenant.slug);
        router.push(`${pathname}?${params.toString()}`);
      }
    },
    [tenants, searchParams, router, pathname],
  );

  const value: TenantContextValue = {
    tenants,
    currentTenant,
    isLoading,
    setCurrentTenant,
  };

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (ctx === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return ctx;
}
```

### 5.2 Organization Switcher Component

**File:** `src/web-ui/components/org-switcher.tsx`

```typescript
"use client";

import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTenant } from "@/contexts/TenantContext";
import { useState } from "react";

export function OrgSwitcher() {
  const { tenants, currentTenant, setCurrentTenant, isLoading } = useTenant();
  const [open, setOpen] = useState(false);

  if (isLoading || tenants.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 opacity-50" />
            <span className="truncate">
              {currentTenant?.name || "Select organization..."}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search organizations..." />
          <CommandList>
            <CommandEmpty>No organization found.</CommandEmpty>
            <CommandGroup>
              {tenants.map((tenant) => (
                <CommandItem
                  key={tenant.id}
                  value={tenant.name}
                  onSelect={() => {
                    setCurrentTenant(tenant.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentTenant?.id === tenant.id
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{tenant.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {tenant.slug}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

---

## Section 6: Layout Architecture

### 6.1 Dashboard Layout with Sidebar

**File:** `src/web-ui/app/(dashboard)/layout.tsx`

```typescript
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
          <Breadcrumbs />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

---

## Section 7: Navigation Components

### 7.1 App Sidebar with Role-Based Items

**File:** `src/web-ui/components/app-sidebar.tsx`

```typescript
"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Settings,
  Users,
  FileText,
  Shield,
  ChevronDown,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { useAuth } from "@/contexts/AuthContext";
import { requiredRoleForPath, meetsMinimumRole } from "@/lib/rbac";
import { UserNav } from "@/components/user-nav";
import { OrgSwitcher } from "@/components/org-switcher";

interface NavSubItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavItem {
  title: string;
  url?: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive?: boolean;
  isExpandable?: boolean;
  items?: NavSubItem[];
}

interface NavGroup {
  title: string;
  url: string;
  items: NavItem[];
}

const data: { navMain: NavGroup[] } = {
  navMain: [
    {
      title: "Platform",
      url: "#",
      items: [
        {
          title: "Dashboard",
          url: "/",
          icon: LayoutDashboard,
        },
        {
          title: "{DOMAIN_ENTITIES}",
          url: "/{FEATURE_MODULE}",
          icon: FileText,
        },
        // Add more nav items based on your domain
      ],
    },
    {
      title: "Settings",
      url: "#",
      items: [
        {
          title: "Configuration",
          url: "/settings",
          icon: Settings,
        },
        {
          title: "Users",
          url: "/settings/users",
          icon: Users,
        },
      ],
    },
  ],
};

function isPathActive(pathname: string, itemUrl: string): boolean {
  if (itemUrl === "/") {
    return pathname === "/";
  }
  return pathname === itemUrl || pathname.startsWith(itemUrl + "/");
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user } = useAuth();

  const userRole = user?.role ?? "user";

  /** Filter nav items by the user's role. */
  const filteredGroups = React.useMemo(() => {
    return data.navMain
      .map((group) => {
        const filteredItems = group.items.reduce<NavItem[]>((acc, item) => {
          if (item.isExpandable && item.items) {
            // For expandable items, filter children first
            const visibleChildren = item.items.filter((sub) =>
              meetsMinimumRole(userRole, requiredRoleForPath(sub.url)),
            );
            // Only show parent if at least one child is visible
            if (visibleChildren.length > 0) {
              acc.push({ ...item, items: visibleChildren });
            }
          } else if (item.url) {
            if (meetsMinimumRole(userRole, requiredRoleForPath(item.url))) {
              acc.push(item);
            }
          }
          return acc;
        }, []);

        return { ...group, items: filteredItems };
      })
      .filter((group) => group.items.length > 0);
  }, [userRole]);

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-2">
          <Shield className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">{PROJECT_TITLE}</span>
        </div>
        <div className="px-4 py-2">
          <OrgSwitcher />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) =>
                  item.isExpandable ? (
                    <Collapsible
                      key={item.title}
                      defaultOpen={true}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.items?.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isPathActive(
                                    pathname,
                                    subItem.url,
                                  )}
                                >
                                  <Link href={subItem.url}>
                                    <subItem.icon className="h-4 w-4" />
                                    <span>{subItem.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  ) : (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isPathActive(pathname, item.url || "")}
                      >
                        <Link href={item.url || "/"}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <UserNav />
      <SidebarRail />
    </Sidebar>
  );
}
```

### 7.2 User Navigation

**File:** `src/web-ui/components/user-nav.tsx`

```typescript
"use client";

import { LogOut, Settings, User, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFooter } from "@/components/ui/sidebar";
import { getInitials } from "@/lib/utils";
import Link from "next/link";

export function UserNav() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  if (!user) return null;

  return (
    <SidebarFooter>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="w-full justify-start gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatar_url} alt={user.name} />
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start text-left">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{user.name}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings/profile">
              <User className="mr-2 h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? (
              <>
                <Sun className="mr-2 h-4 w-4" />
                Light Mode
              </>
            ) : (
              <>
                <Moon className="mr-2 h-4 w-4" />
                Dark Mode
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  );
}
```

### 7.3 Breadcrumbs Component

**File:** `src/web-ui/components/breadcrumbs.tsx`

```typescript
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-2">
      <SidebarTrigger />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {segments.map((segment, index) => {
            const href = `/${segments.slice(0, index + 1).join("/")}`;
            const isLast = index === segments.length - 1;
            const label = segment.charAt(0).toUpperCase() + segment.slice(1);

            return (
              <BreadcrumbItem key={href}>
                <BreadcrumbSeparator>
                  <ChevronRight className="h-4 w-4" />
                </BreadcrumbSeparator>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
```

---

## Section 8: API Client

### 8.1 API Utilities

**File:** `src/web-ui/lib/api.ts`

```typescript
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:{API_PORT}";

export class APIError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: any,
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "APIError";
  }
}

/**
 * Type-safe API client with credentials and error handling
 */
export async function apiClient<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const config: RequestInit = {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new APIError(response.status, response.statusText, body);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new Error(`Network error: ${error}`);
  }
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = any>(endpoint: string, options?: RequestInit) =>
    apiClient<T>(endpoint, { ...options, method: "GET" }),

  post: <T = any>(endpoint: string, data?: any, options?: RequestInit) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(data),
    }),

  put: <T = any>(endpoint: string, data?: any, options?: RequestInit) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(data),
    }),

  patch: <T = any>(endpoint: string, data?: any, options?: RequestInit) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: <T = any>(endpoint: string, options?: RequestInit) =>
    apiClient<T>(endpoint, { ...options, method: "DELETE" }),
};

/**
 * Build query string with org parameter
 */
export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      searchParams.append(key, String(value));
    }
  });
  return searchParams.toString();
}
```

---

## Section 9: Data Table with React Table

### 9.1 Reusable Data Table Component

**File:** `src/web-ui/components/tables/data-table.tsx`

```typescript
"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search...",
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        {searchKey && (
          <Input
            placeholder={searchPlaceholder}
            value={
              (table.getColumn(searchKey)?.getFilterValue() as string) ?? ""
            }
            onChange={(event) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper to create a sortable column header
 */
export function SortableHeader({ column, children }: any) {
  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );
}

/**
 * Helper to create a row actions menu
 */
export function RowActions({ row, actions }: any) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((action: any) => (
          <DropdownMenuItem key={action.label} onClick={action.onClick}>
            {action.icon && <action.icon className="mr-2 h-4 w-4" />}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 9.2 Example Column Definition

**File:** `src/web-ui/app/{FEATURE_MODULE}/columns.tsx`

```typescript
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableHeader, RowActions } from "@/components/tables/data-table";
import { Eye, Edit, Trash2 } from "lucide-react";
import Link from "next/link";

export type {DOMAIN_ENTITY} = {
  id: string;
  name: string;
  status: "active" | "inactive" | "pending";
  created_at: string;
  updated_at: string;
};

export const columns: ColumnDef<{DOMAIN_ENTITY}>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
    cell: ({ row }) => {
      return (
        <Link
          href={`/{FEATURE_MODULE}/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.getValue("name")}
        </Link>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge
          variant={
            status === "active"
              ? "default"
              : status === "inactive"
                ? "secondary"
                : "outline"
          }
        >
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
    cell: ({ row }) => {
      return new Date(row.getValue("created_at")).toLocaleDateString();
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const item = row.original;

      return (
        <RowActions
          row={row}
          actions={[
            {
              label: "View details",
              icon: Eye,
              onClick: () => (window.location.href = `/{FEATURE_MODULE}/${item.id}`),
            },
            {
              label: "Edit",
              icon: Edit,
              onClick: () => (window.location.href = `/{FEATURE_MODULE}/${item.id}/edit`),
            },
            {
              label: "Delete",
              icon: Trash2,
              onClick: () => {
                if (confirm("Are you sure?")) {
                  // Handle delete
                }
              },
            },
          ]}
        />
      );
    },
  },
];
```

### 9.3 Example Table Usage

**File:** `src/web-ui/app/{FEATURE_MODULE}/page.tsx`

```typescript
"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/tables/data-table";
import { columns, type {DOMAIN_ENTITY} } from "./columns";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default function {DOMAIN_ENTITIES}Page() {
  const [data, setData] = useState<{DOMAIN_ENTITY}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const result = await api.get<{DOMAIN_ENTITY}[]>("/{FEATURE_MODULE}");
        setData(result);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{DOMAIN_ENTITIES}</h1>
          <p className="text-muted-foreground">
            Manage your {DOMAIN_ENTITIES.toLowerCase()}
          </p>
        </div>
        <Link href="/{FEATURE_MODULE}/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add New
          </Button>
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        searchPlaceholder="Search {DOMAIN_ENTITIES.toLowerCase()}..."
      />
    </div>
  );
}
```

---

## Section 10: Form Patterns with React Hook Form + Zod

### 10.1 Form Component Example

**File:** `src/web-ui/components/forms/{FEATURE_MODULE}-form.tsx`

```typescript
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

// Define validation schema
const formSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  description: z.string().optional(),
  status: z.enum(["active", "inactive", "pending"]),
  is_enabled: z.boolean().default(true),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface {DOMAIN_ENTITY}FormProps {
  initialData?: Partial<FormValues>;
  id?: string;
}

export function {DOMAIN_ENTITY}Form({ initialData, id }: {DOMAIN_ENTITY}FormProps) {
  const router = useRouter();
  const isEditing = !!id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      description: "",
      status: "pending",
      is_enabled: true,
      email: "",
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      if (isEditing) {
        await api.put(`/{FEATURE_MODULE}/${id}`, values);
        toast.success("{DOMAIN_ENTITY} updated successfully");
      } else {
        await api.post("/{FEATURE_MODULE}", values);
        toast.success("{DOMAIN_ENTITY} created successfully");
      }
      router.push("/{FEATURE_MODULE}");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || "Something went wrong");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter name" {...field} />
              </FormControl>
              <FormDescription>
                This is the display name for the {DOMAIN_ENTITY.toLowerCase()}.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="email@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter description"
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormDescription>Optional description</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="is_enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Enabled</FormLabel>
                <FormDescription>
                  Enable or disable this {DOMAIN_ENTITY.toLowerCase()}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex gap-4">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? "Saving..."
              : isEditing
                ? "Update"
                : "Create"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

### 10.2 Validation Schemas Library

**File:** `src/web-ui/lib/validators.ts`

```typescript
import * as z from "zod";

/**
 * Common validation schemas
 */
export const commonSchemas = {
  email: z.string().email("Invalid email address"),
  url: z.string().url("Invalid URL"),
  uuid: z.string().uuid("Invalid UUID"),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format"),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number"),
  date: z.string().datetime("Invalid date"),
  positiveInt: z.number().int().positive(),
  nonEmptyString: z.string().min(1, "Required"),
};

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

/**
 * Sort schema
 */
export const sortSchema = z.object({
  sort_by: z.string().optional(),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Filter schema builder
 */
export function buildFilterSchema<T extends z.ZodRawShape>(filters: T) {
  return z.object({
    ...filters,
    ...paginationSchema.shape,
    ...sortSchema.shape,
  });
}
```

---

## Section 11: Dashboard & Visualization

### 11.1 Dashboard Widget Pattern

**File:** `src/web-ui/components/dashboard/widget-card.tsx`

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LucideIcon } from "lucide-react";

interface WidgetCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  value?: string | number;
  change?: {
    value: number;
    label: string;
  };
  loading?: boolean;
  children?: React.ReactNode;
}

export function WidgetCard({
  title,
  description,
  icon: Icon,
  value,
  change,
  loading,
  children,
}: WidgetCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            {value !== undefined && (
              <div className="text-2xl font-bold">{value}</div>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {change && (
              <p className="text-xs text-muted-foreground mt-1">
                <span
                  className={
                    change.value > 0
                      ? "text-green-600"
                      : change.value < 0
                        ? "text-red-600"
                        : ""
                  }
                >
                  {change.value > 0 ? "+" : ""}
                  {change.value}%
                </span>{" "}
                {change.label}
              </p>
            )}
            {children}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

### 11.2 Stats Widget

**File:** `src/web-ui/components/dashboard/stats-widget.tsx`

```typescript
"use client";

import { useEffect, useState } from "react";
import { WidgetCard } from "./widget-card";
import { TrendingUp, TrendingDown, Users, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

interface StatsData {
  total_items: number;
  active_users: number;
  pending_reviews: number;
  completion_rate: number;
}

export function StatsWidget() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const result = await api.get<StatsData>("/analytics/stats");
        setData(result);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <WidgetCard
        title="Total Items"
        icon={FileText}
        value={data ? formatNumber(data.total_items) : "-"}
        loading={loading}
        change={{ value: 12, label: "from last month" }}
      />
      <WidgetCard
        title="Active Users"
        icon={Users}
        value={data ? formatNumber(data.active_users) : "-"}
        loading={loading}
        change={{ value: 8, label: "from last month" }}
      />
      <WidgetCard
        title="Pending Reviews"
        icon={TrendingUp}
        value={data ? formatNumber(data.pending_reviews) : "-"}
        loading={loading}
      />
      <WidgetCard
        title="Completion Rate"
        icon={TrendingDown}
        value={data ? `${data.completion_rate}%` : "-"}
        loading={loading}
        change={{ value: -3, label: "from last month" }}
      />
    </div>
  );
}
```

### 11.3 Chart Widget with Recharts

**File:** `src/web-ui/components/dashboard/chart-widget.tsx`

```typescript
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";

interface ChartData {
  date: string;
  value: number;
}

export function ChartWidget() {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const result = await api.get<ChartData[]>("/analytics/trends");
        setData(result);
      } catch (error) {
        console.error("Failed to fetch chart data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trend Analysis</CardTitle>
        <CardDescription>Activity over the last 30 days</CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        {loading ? (
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-muted-foreground">Loading chart...</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Section 12: Modal & Dialog Patterns

### 12.1 Confirmation Dialog

**File:** `src/web-ui/components/dialogs/confirm-dialog.tsx`

```typescript
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              variant === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### 12.2 Form Sheet (Drawer)

**File:** `src/web-ui/components/dialogs/form-sheet.tsx`

```typescript
"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  side?: "left" | "right" | "top" | "bottom";
}

export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "right",
}: FormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="py-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
```

### 12.3 Usage Example

**File:** `src/web-ui/app/{FEATURE_MODULE}/delete-button.tsx`

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function DeleteButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    try {
      await api.delete(`/{FEATURE_MODULE}/${id}`);
      toast.success(`${name} deleted successfully`);
      router.push("/{FEATURE_MODULE}");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Item"
        description={`Are you sure you want to delete "${name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />
    </>
  );
}
```

---

## Section 13: Toast & Notifications

### 13.1 Toast Configuration

Toast notifications are already configured in the root layout using Sonner. Here are common usage patterns:

**Usage Examples:**

```typescript
import { toast } from "sonner";

// Success notification
toast.success("Item created successfully");

// Error notification
toast.error("Failed to save item");

// Info notification
toast.info("Processing your request");

// Warning notification
toast.warning("This action requires confirmation");

// Loading notification
const toastId = toast.loading("Saving...");
// Later update it
toast.success("Saved!", { id: toastId });

// Custom notification with action
toast("Event created", {
  description: "Your event has been scheduled",
  action: {
    label: "View",
    onClick: () => console.log("View clicked"),
  },
});

// Promise-based toast
toast.promise(
  fetch("/api/data").then((res) => res.json()),
  {
    loading: "Loading data...",
    success: "Data loaded successfully",
    error: "Failed to load data",
  }
);
```

---

## Section 14: Custom Hooks

### 14.1 Mobile Detection Hook

**File:** `src/web-ui/hooks/useMobile.ts`

```typescript
"use client";

import { useEffect, useState } from "react";

/**
 * Hook to detect if the viewport is mobile-sized
 */
export function useMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    // Initial check
    checkMobile();

    // Add listener
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, [breakpoint]);

  return isMobile;
}
```

### 14.2 Dashboard Layout Hook

**File:** `src/web-ui/hooks/useDashboardLayout.ts`

```typescript
"use client";

import { useState, useEffect } from "react";

interface WidgetVisibility {
  [key: string]: boolean;
}

const DEFAULT_WIDGETS: WidgetVisibility = {
  "hero-metrics": true,
  "threat-radar": true,
  "ai-insights": true,
  "security-overview": true,
  "scan-activity": true,
  "background-jobs": true,
  "repository-health": true,
  "finding-trends": true,
  "quick-actions": true,
  "executive-summary": true,
  "severity-chart": true,
  "recent-findings": true,
  "scan-schedule-graph": true,
};

export function useDashboardLayout() {
  const [widgets, setWidgets] = useState<WidgetVisibility>(DEFAULT_WIDGETS);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("dashboard-layout");
    if (saved) {
      try {
        setWidgets(JSON.parse(saved));
      } catch (error) {
        console.error("Failed to parse dashboard layout:", error);
      }
    }
  }, []);

  // Save to localStorage when changed
  const toggleWidget = (widgetId: string) => {
    setWidgets((prev) => {
      const newWidgets = { ...prev, [widgetId]: !prev[widgetId] };
      localStorage.setItem("dashboard-layout", JSON.stringify(newWidgets));
      return newWidgets;
    });
  };

  const resetLayout = () => {
    setWidgets(DEFAULT_WIDGETS);
    localStorage.removeItem("dashboard-layout");
  };

  const isVisible = (widgetId: string) => widgets[widgetId] ?? true;

  return {
    widgets,
    toggleWidget,
    resetLayout,
    isVisible,
  };
}
```

### 14.3 Widget Data Hook

**File:** `src/web-ui/hooks/useWidgetData.ts`

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface UseWidgetDataOptions<T> {
  endpoint: string;
  refreshInterval?: number;
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useWidgetData<T>({
  endpoint,
  refreshInterval,
  enabled = true,
  onSuccess,
  onError,
}: UseWidgetDataOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      const result = await api.get<T>(endpoint);
      setData(result);
      setError(null);
      onSuccess?.(result);
    } catch (err) {
      const error = err as Error;
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [endpoint, enabled, onSuccess, onError]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!refreshInterval || !enabled) return;

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, enabled, fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}
```

---

## Section 15: Error Handling

### 15.1 Global Error Boundary

**File:** `src/web-ui/app/error.tsx`

```typescript
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">Something went wrong!</h1>
        <p className="text-muted-foreground max-w-md">
          {error.message || "An unexpected error occurred"}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">Error ID: {error.digest}</p>
        )}
        <div className="flex gap-2 justify-center">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/")}>
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### 15.2 Global Loading State

**File:** `src/web-ui/app/loading.tsx`

```typescript
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
```

### 15.3 404 Not Found

**File:** `src/web-ui/app/not-found.tsx`

```typescript
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center space-y-4">
        <FileQuestion className="h-16 w-16 text-muted-foreground mx-auto" />
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-xl text-muted-foreground">Page not found</p>
        <p className="text-sm text-muted-foreground max-w-md">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button>Back to Home</Button>
        </Link>
      </div>
    </div>
  );
}
```

---

## Section 16: Performance Optimization

### 16.1 Component Memoization

```typescript
"use client";

import { memo } from "react";
import { Card } from "@/components/ui/card";

// Memoize expensive components
export const ExpensiveWidget = memo(function ExpensiveWidget({
  data,
}: {
  data: any;
}) {
  // Expensive rendering logic
  return (
    <Card>
      {/* Content */}
    </Card>
  );
});
```

### 16.2 Dynamic Imports

```typescript
"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// Lazy load heavy components
const ChartWidget = dynamic(() => import("@/components/dashboard/chart-widget"), {
  loading: () => <div>Loading chart...</div>,
  ssr: false,
});

const DataTable = dynamic(() => import("@/components/tables/data-table"), {
  loading: () => <div>Loading table...</div>,
});

export function DashboardPage() {
  return (
    <div>
      <Suspense fallback={<div>Loading...</div>}>
        <ChartWidget />
        <DataTable />
      </Suspense>
    </div>
  );
}
```

### 16.3 Image Optimization

```typescript
import Image from "next/image";

export function OptimizedImage() {
  return (
    <Image
      src="/logo.png"
      alt="Logo"
      width={200}
      height={50}
      priority // For above-the-fold images
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,..." // Optional blur placeholder
    />
  );
}
```

---

## Section 17: Validation Checklist

### 17.1 Pre-Deployment Checklist

- [ ] **Authentication**
  - [ ] Login flow works with {AUTH_PROVIDER}
  - [ ] Break-glass login tested
  - [ ] Session polling active (5 min interval)
  - [ ] Logout redirects properly
  - [ ] Protected routes redirect to login

- [ ] **Theming**
  - [ ] Light/dark mode toggle works
  - [ ] CSS variables defined for all colors
  - [ ] Theme persists across page loads
  - [ ] All components respect theme

- [ ] **Navigation**
  - [ ] Sidebar shows correct items based on role
  - [ ] Breadcrumbs update correctly
  - [ ] Active states highlight current page
  - [ ] Mobile drawer works on small screens

- [ ] **Forms**
  - [ ] All forms use React Hook Form + Zod
  - [ ] Validation messages display properly
  - [ ] Submit handlers show loading states
  - [ ] Success/error toasts appear

- [ ] **Data Tables**
  - [ ] Sorting works on all columns
  - [ ] Filtering works correctly
  - [ ] Pagination functions properly
  - [ ] Row selection works
  - [ ] Column visibility toggle works

- [ ] **API Integration**
  - [ ] All endpoints use credentials: "include"
  - [ ] Error handling displays user-friendly messages
  - [ ] Loading states shown during requests
  - [ ] 401 errors trigger re-authentication

- [ ] **Performance**
  - [ ] Large components are lazy-loaded
  - [ ] Images use Next.js Image component
  - [ ] No console errors in production build
  - [ ] Lighthouse score > 90

- [ ] **Accessibility**
  - [ ] Keyboard navigation works
  - [ ] Focus indicators visible
  - [ ] ARIA labels on interactive elements
  - [ ] Color contrast meets WCAG AA

- [ ] **Responsive Design**
  - [ ] Works on mobile (< 768px)
  - [ ] Works on tablet (768px - 1024px)
  - [ ] Works on desktop (> 1024px)
  - [ ] Touch targets are 44x44px minimum

- [ ] **Error Handling**
  - [ ] Error boundaries catch crashes
  - [ ] 404 page displays correctly
  - [ ] Network errors show retry options
  - [ ] Form errors show field-level messages

### 17.2 Build Commands

```bash
# Development
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

### 17.3 Environment Variables Check

```bash
# Verify all required env vars are set
echo "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}"
echo "NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}"
```

---

## Summary

This plan provides a complete, production-ready Next.js frontend implementation following AuditGH patterns:

1. **Next.js App Router** with TypeScript, Tailwind CSS, and shadcn/ui
2. **Authentication** with session polling, break-glass access, and role-based navigation
3. **Multi-tenant support** with organization switching
4. **Reusable components** including data tables, forms, charts, and modals
5. **API client** with type safety and error handling
6. **Performance optimizations** with lazy loading and memoization
7. **Comprehensive error handling** with boundaries and fallbacks

Every code block is copy-paste ready with `{PLACEHOLDER}` patterns for easy customization. Replace placeholders with your project-specific values and you'll have a fully functional, production-grade frontend.
