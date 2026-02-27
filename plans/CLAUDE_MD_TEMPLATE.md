# CLAUDE.md Template for Full-Stack Web Applications

> **Usage:** Copy this file to `.claude/CLAUDE.md` (user-level) or `CLAUDE.md` (project root) and customize for your project. Remove all `<!-- TEMPLATE: -->` comments after customizing.

---

# Claude Code Configuration

## Project Overview

<!-- TEMPLATE: Replace with your project's one-liner -->
**{Project Name}** — {Brief description of what the project does}.

### Tech Stack
<!-- TEMPLATE: Update to match your actual stack -->
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js / React |
| Backend API | FastAPI / Express / Spring Boot |
| Database | PostgreSQL |
| Cache | Redis |
| Auth | OIDC (Entra ID) |
| Infrastructure | Docker / AWS ECS / Kubernetes |

### Architecture
<!-- TEMPLATE: Update the port numbers and service names -->
```
Frontend  :3000  ──>  API  :8000  ──>  PostgreSQL  :5432
                         │
                         └──>  Redis  :6379
```

---

## Critical Rules

<!-- TEMPLATE: These are foundational. Keep all that apply, remove what doesn't. -->

### Code Quality
- Read files before editing — understand existing code before modifying
- Prefer editing existing files over creating new ones
- Keep changes minimal and focused — only modify what's directly requested
- Do not add features, abstractions, or improvements beyond what was asked
- Do not add comments, docstrings, or type annotations to code you didn't change
- Run tests after implementation changes when a test suite exists

### Security
- NEVER commit `.env` files, credentials, API keys, or secrets
- Use absolute paths in all programming to prevent path traversal issues
- Validate all user input at system boundaries
- Use parameterized queries — never string-interpolate SQL
- Follow OWASP Top 10 guidelines for all web-facing code

### Git Discipline
- Never force push to main/master
- Never skip pre-commit hooks (--no-verify)
- Never amend published commits without explicit request
- Create focused commits with descriptive messages
- Stage specific files — avoid `git add -A` or `git add .`

### Testing
- NEVER mark tasks complete without validating functionality
- Run the full test suite before declaring work done
- Write tests for new features and bug fixes
- Test edge cases, not just happy paths

---

## Project Structure

<!-- TEMPLATE: Update to match your actual project layout -->
```
project-root/
├── src/
│   ├── api/                    # Backend API
│   │   ├── main.py             # App entrypoint
│   │   ├── routers/            # Route handlers
│   │   ├── middleware/         # Auth, logging, CORS
│   │   ├── models.py           # Database models (SQLAlchemy/Prisma)
│   │   └── database.py         # DB connection and session
│   ├── auth/                   # Authentication module
│   │   ├── providers.py        # OIDC provider registration
│   │   ├── config.py           # Auth settings
│   │   └── dependencies.py     # Auth injection
│   ├── rbac/                   # Role-based access control
│   │   ├── models.py           # Role, Permission models
│   │   └── seeds.py            # Default roles/permissions
│   ├── services/               # Business logic
│   └── web-ui/                 # Frontend (Next.js)
│       ├── app/                # Pages (App Router)
│       ├── components/         # React components
│       ├── contexts/           # React contexts (Auth, Theme)
│       └── hooks/              # Custom hooks
├── migrations/                 # Database migrations
├── tests/                      # Test suite
├── infrastructure/             # IaC (Terraform, ECS task defs)
├── scripts/                    # Utility scripts
├── docker-compose.yml          # Local development stack
├── Dockerfile.api              # API container
├── Dockerfile.ui               # Frontend container
├── requirements.txt            # Python dependencies
├── .env.sample                 # Environment template (NO secrets)
└── .env                        # Local environment (NEVER commit)
```

---

## Development Workflow

### Starting the Stack
<!-- TEMPLATE: Update commands for your project -->
```bash
# Start all services
docker compose up -d

# Start with mock auth (development)
make dev-up

# View logs
docker compose logs -f api
```

### Running Tests
<!-- TEMPLATE: Update test commands -->
```bash
# Python tests
docker exec app pytest tests/ -v

# Frontend tests
cd src/web-ui && npm test

# Specific test file
docker exec app pytest tests/test_auth.py -v
```

### Database Operations
<!-- TEMPLATE: Update for your migration tool -->
```bash
# Run migrations
docker exec app python -m alembic upgrade head

# Create new migration
docker exec app python -m alembic revision --autogenerate -m "description"

# Seed data
docker exec app python -m src.rbac.seeds
```

---

## Environment Configuration

<!-- TEMPLATE: List your key env vars. Never include actual values. -->
| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_HOST` | Yes | Database hostname |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `REDIS_URL` | Yes | Redis connection string |
| `SESSION_SECRET` | Yes | Session signing key (32+ chars) |
| `JWT_SECRET_KEY` | Yes | JWT signing key (32+ chars) |
| `ENTRA_TENANT_ID` | Yes (prod) | Microsoft Entra tenant ID |
| `ENTRA_CLIENT_ID` | Yes (prod) | Entra app client ID |
| `ENTRA_CLIENT_SECRET` | Yes (prod) | Entra app client secret |
| `APP_URL` | Yes | Frontend URL (for redirects) |
| `SMTP_HOST` | For invites | Email server hostname |
| `AUTH_REQUIRED` | No | `true` in prod, `false` for dev |

See `.env.sample` for the complete list with defaults.

---

## Conventions

### Naming
<!-- TEMPLATE: Define your project's naming conventions -->
| Element | Convention | Example |
|---------|-----------|---------|
| Files (Python) | snake_case | `user_service.py` |
| Files (TypeScript) | PascalCase for components, kebab-case for utils | `UserNav.tsx`, `use-mobile.ts` |
| API routes | kebab-case | `/api/attack-surface` |
| Database tables | snake_case, plural | `user_invitations` |
| Environment vars | UPPER_SNAKE_CASE | `POSTGRES_HOST` |
| React components | PascalCase | `SecurityReportModal` |
| CSS classes | Tailwind utility classes | `className="flex items-center gap-2"` |

### API Patterns
<!-- TEMPLATE: Define your API conventions -->
- RESTful resource naming (`/api/findings`, `/api/repositories`)
- Consistent error response format: `{ "detail": "Error message" }`
- Use proper HTTP status codes (200, 201, 400, 401, 403, 404, 429, 500)
- Paginate list endpoints with `?page=1&per_page=50`
- Include `Content-Type: application/json` on all responses

### Component Patterns (Frontend)
<!-- TEMPLATE: Define your frontend conventions -->
- Use shadcn/ui components from `components/ui/`
- Wrap pages in layout components, not raw HTML
- Use React Context for global state (Auth, Theme, Tenant)
- Fetch data in page components, pass down to presentational components
- Use `lucide-react` for icons — don't pass `title` prop directly to icon components

---

## Common Tasks

<!-- TEMPLATE: Add project-specific common operations -->

### Add a New API Endpoint
1. Create or update router file in `src/api/routers/`
2. Add route with appropriate auth dependency: `Depends(get_current_user)`
3. Add RBAC guard if needed: `Depends(require_role('analyst', 'admin'))`
4. Register router in `src/api/main.py`
5. Add tests in `tests/`

### Add a New Frontend Page
1. Create page file in `src/web-ui/app/{route}/page.tsx`
2. Add navigation link in `src/web-ui/components/app-sidebar.tsx`
3. Use `useAuth()` for role-based rendering
4. Fetch data from API with `credentials: 'include'`

### Add a Database Migration
1. Modify models in `src/api/models.py`
2. Generate migration: `alembic revision --autogenerate -m "description"`
3. Review generated migration file
4. Apply: `alembic upgrade head`
5. Test rollback: `alembic downgrade -1`

---

## Troubleshooting

<!-- TEMPLATE: Add known issues specific to your project -->
| Issue | Cause | Solution |
|-------|-------|----------|
| Docker build SSL errors | Corporate proxy (Zscaler) intercepting HTTPS | Disable proxy during builds |
| OIDC login fails with "Missing code_challenge" | PKCE not configured in provider registration | Add `code_challenge_method: 'S256'` to client_kwargs |
| Post-login redirects to API instead of frontend | Callback uses `url='/'` instead of APP_URL | Set `APP_URL` env var to frontend URL |
| "No invitation found" on first login | No users bootstrapped in database | Run `python -m src.auth.bootstrap` |
| Session cookie not sent cross-origin | Missing `credentials: 'include'` in fetch | Add credentials option to all API calls |
| Next.js Google Fonts fail in Docker | No network access during build | Use `next/font/local` or ensure network access |

---

## Do NOT Do

<!-- TEMPLATE: Add project-specific anti-patterns -->
- Do not modify `migrations/versions/` files after they've been applied
- Do not store secrets in code or commit `.env` files
- Do not use `SELECT *` in database queries
- Do not disable TypeScript strict mode
- Do not use `any` type in TypeScript without justification
- Do not add dependencies without checking bundle size impact
- Do not use `dangerouslySetInnerHTML` without sanitization
- Do not bypass auth middleware with `AUTH_DISABLED=true` in production
- Do not use `git push --force` on shared branches

---

<!-- TEMPLATE: Remove everything below this line in your final CLAUDE.md -->
<!--
CUSTOMIZATION CHECKLIST:
  [ ] Updated Project Overview section
  [ ] Updated Tech Stack table
  [ ] Updated Architecture diagram with correct ports
  [ ] Reviewed Critical Rules (kept relevant, removed irrelevant)
  [ ] Updated Project Structure to match actual layout
  [ ] Updated Development Workflow commands
  [ ] Updated Environment Configuration table
  [ ] Updated Naming Conventions
  [ ] Added project-specific Common Tasks
  [ ] Added project-specific Troubleshooting entries
  [ ] Added project-specific Do NOT Do items
  [ ] Removed all TEMPLATE comments
  [ ] Removed this customization checklist
-->
