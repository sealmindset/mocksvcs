# Phase 10: CI/CD Pipeline Plan

> **Purpose:** Establish a production-grade continuous integration and deployment pipeline using GitHub Actions, covering code quality, testing, Docker builds, container registry management, multi-environment deployments (staging/production), Terraform infrastructure automation, secret management, and operational excellence practices. This plan provides complete YAML configurations that can be parameterized and adapted to any project following the AuditGH reference architecture.
>
> **Reference Implementation:** [AuditGH](../README.md) -- patterns derived from production Docker builds, Makefile workflows, and enterprise deployment requirements.

---

## Placeholder Legend

| Placeholder | Description | Example (AuditGH) |
|---|---|---|
| `{PROJECT_NAME}` | Lowercase project identifier | `auditgh` |
| `{PROJECT_TITLE}` | Human-readable project title | `AuditGH Security Portal` |
| `{AWS_REGION}` | AWS region for deployments | `us-east-1` |
| `{AWS_ACCOUNT_ID}` | AWS account ID | `123456789012` |
| `{ECR_REGISTRY}` | ECR registry URL | `{AWS_ACCOUNT_ID}.dkr.ecr.{AWS_REGION}.amazonaws.com` |
| `{ECS_CLUSTER}` | ECS cluster name | `{PROJECT_NAME}-production` |
| `{ECS_SERVICE_API}` | ECS service name for API | `{PROJECT_NAME}-api` |
| `{ECS_SERVICE_UI}` | ECS service name for UI | `{PROJECT_NAME}-ui` |
| `{SLACK_WEBHOOK_URL}` | Slack notification webhook | `https://hooks.slack.com/services/XXX/YYY/ZZZ` |
| `{GITHUB_ORG}` | GitHub organization | `sleepnumber` |
| `{GITHUB_REPO}` | GitHub repository name | `{PROJECT_NAME}` |
| `{MAIN_BRANCH}` | Main/default branch | `main` |
| `{STAGING_BRANCH}` | Staging branch (optional) | `staging` |

---

## 1. Pipeline Architecture

### Overview

The CI/CD pipeline is organized into independent, reusable workflows that can be chained together or run in parallel. This architecture provides:

- **Fast feedback loops** — linting and type checks complete in ~2 minutes
- **Parallel execution** — tests, quality checks, and builds run concurrently
- **Selective deployment** — staging auto-deploys on merge, production requires approval
- **Fail-fast behavior** — infrastructure validation blocks broken deployments
- **Caching strategies** — Docker layers, pip, npm, and Next.js build caches reduce build times by 60-80%

### Workflow Dependency Graph

```
┌─────────────────┐
│   Pull Request  │
│     Opened      │
└────────┬────────┘
         │
         ├──► Code Quality (lint, format, type check)
         ├──► Security Scan (Semgrep, Trivy, dependency audit)
         ├──► Tests (pytest, jest, coverage)
         ├──► Terraform Plan (staging)
         └──► Docker Build (validate only, no push)
                    │
                    ▼
         ┌──────────────────┐
         │  PR Approved &   │
         │  Merged to main  │
         └────────┬─────────┘
                  │
                  ├──► Build & Push Images (API, UI, Scanner)
                  ├──► Terraform Apply (staging)
                  └──► Deploy to Staging
                             │
                             ▼
                  ┌──────────────────┐
                  │  Staging Tests   │
                  │   Pass + Manual  │
                  │    Approval      │
                  └────────┬─────────┘
                           │
                           ├──► Terraform Apply (production)
                           └──► Deploy to Production
                                      │
                                      ├──► Health Checks
                                      ├──► Smoke Tests
                                      └──► Notify Slack/Teams
```

### Trigger Conditions

| Workflow | Triggers | Branch Filters | Path Filters |
|---|---|---|---|
| Code Quality | `pull_request`, `push` | All branches | `src/**`, `*.py`, `*.ts`, `*.tsx`, `*.js` |
| Tests | `pull_request`, `push` | All branches | `src/**`, `tests/**`, `requirements.txt`, `package.json` |
| Build Images | `push` | `main`, `staging` | `src/**`, `Dockerfile.*`, `requirements.txt`, `package.json` |
| Deploy Staging | `push` | `main` | `src/**`, `infrastructure/**`, `Dockerfile.*` |
| Deploy Production | `workflow_dispatch` (manual) | `main` | N/A |
| Terraform Plan | `pull_request` | All branches | `infrastructure/**/*.tf` |
| Terraform Apply | `push` | `main`, `staging` | `infrastructure/**/*.tf` |

---

## 2. Code Quality Workflow

This workflow enforces consistent code style, type safety, and security standards across Python (FastAPI backend) and TypeScript (Next.js frontend).

### `.github/workflows/code-quality.yml`

```yaml
name: Code Quality

on:
  pull_request:
    paths:
      - 'src/**'
      - '**.py'
      - '**.ts'
      - '**.tsx'
      - '**.js'
      - 'requirements*.txt'
      - 'package.json'
      - '.github/workflows/code-quality.yml'
  push:
    branches: [main, staging]
    paths:
      - 'src/**'
      - '**.py'
      - '**.ts'
      - '**.tsx'
      - '**.js'

jobs:
  # ===========================================================================
  # Python Backend Linting & Type Checking
  # ===========================================================================
  python-quality:
    name: Python Quality (black, isort, ruff, mypy)
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for better analysis

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install black isort ruff mypy types-redis types-requests
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi

      - name: Check code formatting with black
        run: |
          black --check --diff src/

      - name: Check import ordering with isort
        run: |
          isort --check-only --diff src/

      - name: Lint with ruff
        run: |
          ruff check src/ --output-format=github

      - name: Type check with mypy
        run: |
          mypy src/ --ignore-missing-imports --show-error-codes --pretty
        continue-on-error: true  # Don't block on type errors initially

  # ===========================================================================
  # Frontend Linting & Type Checking
  # ===========================================================================
  frontend-quality:
    name: Frontend Quality (eslint, prettier, tsc)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: src/web-ui

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: src/web-ui/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Check formatting with Prettier
        run: |
          npx prettier --check "**/*.{ts,tsx,js,jsx,json,css,md}"

      - name: Type check with TypeScript
        run: npx tsc --noEmit

  # ===========================================================================
  # Security Scanning
  # ===========================================================================
  security-scan:
    name: Security Scan (Semgrep, Trivy, npm audit)
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/secrets
            p/owasp-top-ten

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

      - name: Audit Python dependencies
        run: |
          pip install --upgrade pip
          pip install safety
          pip freeze | safety check --stdin
        continue-on-error: true

      - name: Audit npm dependencies
        working-directory: src/web-ui
        run: |
          npm audit --audit-level=high
        continue-on-error: true
```

---

## 3. Test Workflow

Runs unit tests, integration tests, and generates coverage reports for both backend (pytest) and frontend (Jest).

### `.github/workflows/tests.yml`

```yaml
name: Tests

on:
  pull_request:
    paths:
      - 'src/**'
      - 'tests/**'
      - 'requirements*.txt'
      - 'package.json'
      - '.github/workflows/tests.yml'
  push:
    branches: [main, staging]

env:
  POSTGRES_USER: test_user
  POSTGRES_PASSWORD: test_pass
  POSTGRES_DB: test_db
  DATABASE_URL: postgresql://test_user:test_pass@localhost:5432/test_db
  REDIS_URL: redis://localhost:6379/0

jobs:
  # ===========================================================================
  # Backend Tests (pytest)
  # ===========================================================================
  backend-tests:
    name: Backend Tests (Python)
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: ${{ env.POSTGRES_USER }}
          POSTGRES_PASSWORD: ${{ env.POSTGRES_PASSWORD }}
          POSTGRES_DB: ${{ env.POSTGRES_DB }}
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install pytest pytest-cov pytest-asyncio pytest-mock
          pip install -r requirements.txt

      - name: Run database migrations
        run: |
          python -m alembic upgrade head
        env:
          DATABASE_URL: ${{ env.DATABASE_URL }}

      - name: Run pytest with coverage
        run: |
          pytest tests/ \
            --cov=src/ \
            --cov-report=xml \
            --cov-report=term-missing \
            --junitxml=pytest-report.xml \
            -v
        env:
          DATABASE_URL: ${{ env.DATABASE_URL }}
          REDIS_URL: ${{ env.REDIS_URL }}
          SECRETS_MASTER_KEY: test_key_32_characters_long!!

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage.xml
          flags: backend
          name: backend-coverage

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: backend-test-results
          path: pytest-report.xml

  # ===========================================================================
  # Frontend Tests (Jest)
  # ===========================================================================
  frontend-tests:
    name: Frontend Tests (Jest)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: src/web-ui

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: src/web-ui/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run Jest tests
        run: |
          npm test -- --coverage --watchAll=false

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./src/web-ui/coverage/coverage-final.json
          flags: frontend
          name: frontend-coverage
```

---

## 4. Build Workflow

Builds Docker images for API, UI, and Scanner services using multi-stage builds with layer caching.

### `.github/workflows/build.yml`

```yaml
name: Build & Push Images

on:
  push:
    branches: [main, staging]
    paths:
      - 'src/**'
      - 'Dockerfile.*'
      - 'requirements*.txt'
      - 'package.json'
      - '.github/workflows/build.yml'
  workflow_dispatch:

env:
  AWS_REGION: {AWS_REGION}
  ECR_REGISTRY: {ECR_REGISTRY}
  IMAGE_TAG: ${{ github.sha }}

jobs:
  # ===========================================================================
  # Build & Push API Image
  # ===========================================================================
  build-api:
    name: Build API Image
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile.api
          push: true
          tags: |
            ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:${{ env.IMAGE_TAG }}
            ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:${{ github.ref_name }}
            ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:latest
          cache-from: type=registry,ref=${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:buildcache
          cache-to: type=registry,ref=${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:buildcache,mode=max
          build-args: |
            BUILDKIT_INLINE_CACHE=1

      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:${{ env.IMAGE_TAG }}
          format: 'sarif'
          output: 'trivy-api-results.sarif'

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-api-results.sarif'

  # ===========================================================================
  # Build & Push UI Image
  # ===========================================================================
  build-ui:
    name: Build UI Image
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push UI image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile.ui
          target: runner
          push: true
          tags: |
            ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-ui:${{ env.IMAGE_TAG }}
            ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-ui:${{ github.ref_name }}
            ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-ui:latest
          cache-from: type=registry,ref=${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-ui:buildcache
          cache-to: type=registry,ref=${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-ui:buildcache,mode=max
          build-args: |
            BUILDKIT_INLINE_CACHE=1
            NEXT_PUBLIC_API_URL=${{ secrets.NEXT_PUBLIC_API_URL }}

  # ===========================================================================
  # Build & Push Scanner Image
  # ===========================================================================
  build-scanner:
    name: Build Scanner Image
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push Scanner image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile.scanner
          push: true
          tags: |
            ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-scanner:${{ env.IMAGE_TAG }}
            ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-scanner:${{ github.ref_name }}
            ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-scanner:latest
          cache-from: type=registry,ref=${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-scanner:buildcache
          cache-to: type=registry,ref=${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-scanner:buildcache,mode=max
```

---

## 5. Container Registry

ECR lifecycle policies ensure old images are cleaned up automatically, reducing storage costs.

### ECR Lifecycle Policy (apply via Terraform or AWS Console)

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 tagged images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["v", "main", "staging"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {
        "type": "expire"
      }
    },
    {
      "rulePriority": 2,
      "description": "Expire untagged images older than 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
```

### Image Scanning Configuration

Enable automatic vulnerability scanning in ECR:

```hcl
# infrastructure/ecr.tf
resource "aws_ecr_repository" "api" {
  name                 = "{PROJECT_NAME}-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.ecr.arn
  }
}
```

---

## 6. Deploy to Staging

Auto-deploys on every merge to `main`, runs database migrations, updates ECS service, and validates with health checks.

### `.github/workflows/deploy-staging.yml`

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'infrastructure/**'
      - 'Dockerfile.*'
      - '.github/workflows/deploy-staging.yml'
  workflow_dispatch:

env:
  AWS_REGION: {AWS_REGION}
  ECR_REGISTRY: {ECR_REGISTRY}
  ECS_CLUSTER: {PROJECT_NAME}-staging
  ECS_SERVICE_API: {PROJECT_NAME}-api
  ECS_SERVICE_UI: {PROJECT_NAME}-ui
  IMAGE_TAG: ${{ github.sha }}

jobs:
  deploy:
    name: Deploy to Staging Environment
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.{PROJECT_NAME}.company.com

    permissions:
      id-token: write
      contents: read

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsRole
          aws-region: ${{ env.AWS_REGION }}

      # =========================================================================
      # Run Database Migrations
      # =========================================================================
      - name: Run database migrations
        run: |
          # Run migrations via ECS task (one-off container)
          aws ecs run-task \
            --cluster ${{ env.ECS_CLUSTER }} \
            --task-definition {PROJECT_NAME}-migrations \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[${{ secrets.PRIVATE_SUBNET_IDS }}],securityGroups=[${{ secrets.MIGRATION_SG_ID }}],assignPublicIp=DISABLED}" \
            --overrides '{
              "containerOverrides": [{
                "name": "migrations",
                "command": ["python", "-m", "alembic", "upgrade", "head"]
              }]
            }'

      # =========================================================================
      # Deploy API Service
      # =========================================================================
      - name: Download API task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition {PROJECT_NAME}-api \
            --query taskDefinition > task-def-api.json

      - name: Update API task definition with new image
        id: update-api-task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-def-api.json
          container-name: api
          image: ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:${{ env.IMAGE_TAG }}

      - name: Deploy API to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.update-api-task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE_API }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true

      # =========================================================================
      # Deploy UI Service
      # =========================================================================
      - name: Download UI task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition {PROJECT_NAME}-ui \
            --query taskDefinition > task-def-ui.json

      - name: Update UI task definition with new image
        id: update-ui-task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-def-ui.json
          container-name: ui
          image: ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-ui:${{ env.IMAGE_TAG }}

      - name: Deploy UI to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.update-ui-task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE_UI }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true

      # =========================================================================
      # Health Checks & Smoke Tests
      # =========================================================================
      - name: Wait for health checks
        run: |
          echo "Waiting 30 seconds for services to stabilize..."
          sleep 30

      - name: Run smoke tests
        run: |
          # Health check
          curl -f https://staging.{PROJECT_NAME}.company.com/health || exit 1

          # API version check
          curl -f https://staging.{PROJECT_NAME}.company.com/api/version || exit 1

          echo "✅ Smoke tests passed"

      - name: Notify Slack on success
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "✅ Staging deployment successful",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*{PROJECT_TITLE}* deployed to *staging*\n*Commit:* <${{ github.event.head_commit.url }}|${{ github.sha }}>\n*Author:* ${{ github.actor }}"
                  }
                }
              ]
            }

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "❌ Staging deployment failed",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*{PROJECT_TITLE}* deployment to *staging* failed\n*Commit:* <${{ github.event.head_commit.url }}|${{ github.sha }}>\n*Author:* ${{ github.actor }}\n*Logs:* <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View logs>"
                  }
                }
              ]
            }
```

---

## 7. Deploy to Production

Manual approval required. Uses rolling deployment with automated rollback on health check failure.

### `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'Image tag to deploy (default: latest from main)'
        required: false
        default: 'latest'

env:
  AWS_REGION: {AWS_REGION}
  ECR_REGISTRY: {ECR_REGISTRY}
  ECS_CLUSTER: {PROJECT_NAME}-production
  ECS_SERVICE_API: {PROJECT_NAME}-api
  ECS_SERVICE_UI: {PROJECT_NAME}-ui

jobs:
  # ===========================================================================
  # Manual Approval Gate
  # ===========================================================================
  approval:
    name: Production Deployment Approval
    runs-on: ubuntu-latest
    environment:
      name: production-approval
    steps:
      - name: Request approval
        run: echo "Deployment to production approved by ${{ github.actor }}"

  # ===========================================================================
  # Production Deployment
  # ===========================================================================
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: approval
    environment:
      name: production
      url: https://{PROJECT_NAME}.company.com

    permissions:
      id-token: write
      contents: read

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Determine image tag
        id: image-tag
        run: |
          if [ "${{ github.event.inputs.image_tag }}" == "latest" ]; then
            # Get the latest SHA from main branch
            TAG=$(git rev-parse origin/main)
          else
            TAG="${{ github.event.inputs.image_tag }}"
          fi
          echo "IMAGE_TAG=$TAG" >> $GITHUB_OUTPUT

      # =========================================================================
      # Backup Current Task Definitions (for rollback)
      # =========================================================================
      - name: Backup current task definitions
        run: |
          aws ecs describe-task-definition \
            --task-definition {PROJECT_NAME}-api \
            --query taskDefinition > backup-task-def-api.json

          aws ecs describe-task-definition \
            --task-definition {PROJECT_NAME}-ui \
            --query taskDefinition > backup-task-def-ui.json

          echo "Backups saved for rollback"

      # =========================================================================
      # Run Database Migrations
      # =========================================================================
      - name: Run production migrations
        run: |
          aws ecs run-task \
            --cluster ${{ env.ECS_CLUSTER }} \
            --task-definition {PROJECT_NAME}-migrations \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[${{ secrets.PROD_PRIVATE_SUBNET_IDS }}],securityGroups=[${{ secrets.PROD_MIGRATION_SG_ID }}],assignPublicIp=DISABLED}" \
            --overrides '{
              "containerOverrides": [{
                "name": "migrations",
                "command": ["python", "-m", "alembic", "upgrade", "head"]
              }]
            }'

      # =========================================================================
      # Deploy API Service (Rolling Deployment)
      # =========================================================================
      - name: Download API task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition {PROJECT_NAME}-api \
            --query taskDefinition > task-def-api.json

      - name: Update API task definition
        id: update-api-task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-def-api.json
          container-name: api
          image: ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:${{ steps.image-tag.outputs.IMAGE_TAG }}

      - name: Deploy API to production ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.update-api-task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE_API }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true
          wait-for-minutes: 10

      # =========================================================================
      # Deploy UI Service
      # =========================================================================
      - name: Download UI task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition {PROJECT_NAME}-ui \
            --query taskDefinition > task-def-ui.json

      - name: Update UI task definition
        id: update-ui-task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-def-ui.json
          container-name: ui
          image: ${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-ui:${{ steps.image-tag.outputs.IMAGE_TAG }}

      - name: Deploy UI to production ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.update-ui-task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE_UI }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true
          wait-for-minutes: 10

      # =========================================================================
      # Post-Deployment Health Checks
      # =========================================================================
      - name: Production health checks
        id: health-check
        run: |
          echo "Waiting 60 seconds for deployment to stabilize..."
          sleep 60

          # Health check
          if ! curl -f https://{PROJECT_NAME}.company.com/health; then
            echo "❌ Health check failed"
            exit 1
          fi

          # API version check
          if ! curl -f https://{PROJECT_NAME}.company.com/api/version; then
            echo "❌ API version check failed"
            exit 1
          fi

          echo "✅ All health checks passed"

      # =========================================================================
      # Automated Rollback on Failure
      # =========================================================================
      - name: Rollback on failure
        if: failure() && steps.health-check.outcome == 'failure'
        run: |
          echo "🔄 Rolling back to previous version..."

          # Rollback API
          aws ecs update-service \
            --cluster ${{ env.ECS_CLUSTER }} \
            --service ${{ env.ECS_SERVICE_API }} \
            --task-definition $(cat backup-task-def-api.json | jq -r '.family + ":" + (.revision|tostring)')

          # Rollback UI
          aws ecs update-service \
            --cluster ${{ env.ECS_CLUSTER }} \
            --service ${{ env.ECS_SERVICE_UI }} \
            --task-definition $(cat backup-task-def-ui.json | jq -r '.family + ":" + (.revision|tostring)')

          echo "❌ Rollback complete"
          exit 1

      # =========================================================================
      # Notifications
      # =========================================================================
      - name: Notify Slack on success
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "✅ Production deployment successful",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*{PROJECT_TITLE}* deployed to *production*\n*Image Tag:* ${{ steps.image-tag.outputs.IMAGE_TAG }}\n*Deployed by:* ${{ github.actor }}"
                  }
                }
              ]
            }

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "❌ Production deployment failed - ROLLBACK INITIATED",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*{PROJECT_TITLE}* production deployment failed\n*Image Tag:* ${{ steps.image-tag.outputs.IMAGE_TAG }}\n*Deployed by:* ${{ github.actor }}\n*Status:* Rolled back to previous version\n*Logs:* <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View logs>"
                  }
                }
              ]
            }
```

---

## 8. Terraform Workflow

Runs `terraform plan` on PRs, `terraform apply` on merge to main. Includes state locking and drift detection.

### `.github/workflows/terraform.yml`

```yaml
name: Terraform

on:
  pull_request:
    paths:
      - 'infrastructure/**/*.tf'
      - '.github/workflows/terraform.yml'
  push:
    branches: [main]
    paths:
      - 'infrastructure/**/*.tf'
  schedule:
    # Daily drift detection at 6 AM UTC
    - cron: '0 6 * * *'
  workflow_dispatch:

env:
  AWS_REGION: {AWS_REGION}
  TF_VERSION: 1.6.0

jobs:
  # ===========================================================================
  # Terraform Plan (on PR)
  # ===========================================================================
  plan:
    name: Terraform Plan
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'

    permissions:
      id-token: write
      contents: read
      pull-requests: write

    defaults:
      run:
        working-directory: infrastructure

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsTerraformRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform fmt check
        run: terraform fmt -check -recursive
        continue-on-error: true

      - name: Terraform init
        run: |
          terraform init \
            -backend-config="bucket={PROJECT_NAME}-terraform-state" \
            -backend-config="key=infrastructure/terraform.tfstate" \
            -backend-config="region=${{ env.AWS_REGION }}" \
            -backend-config="dynamodb_table={PROJECT_NAME}-terraform-locks"

      - name: Terraform validate
        run: terraform validate

      - name: Terraform plan
        id: plan
        run: |
          terraform plan -no-color -out=tfplan
          terraform show -no-color tfplan > plan-output.txt
        continue-on-error: true

      - name: Comment PR with plan
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('infrastructure/plan-output.txt', 'utf8');
            const truncatedPlan = plan.length > 65000 ? plan.substring(0, 65000) + '\n\n... (truncated)' : plan;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Terraform Plan\n\`\`\`hcl\n${truncatedPlan}\n\`\`\``
            });

      - name: Upload plan artifact
        uses: actions/upload-artifact@v4
        with:
          name: terraform-plan
          path: infrastructure/tfplan

  # ===========================================================================
  # Terraform Apply (on merge to main)
  # ===========================================================================
  apply:
    name: Terraform Apply
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    permissions:
      id-token: write
      contents: read

    defaults:
      run:
        working-directory: infrastructure

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsTerraformRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform init
        run: |
          terraform init \
            -backend-config="bucket={PROJECT_NAME}-terraform-state" \
            -backend-config="key=infrastructure/terraform.tfstate" \
            -backend-config="region=${{ env.AWS_REGION }}" \
            -backend-config="dynamodb_table={PROJECT_NAME}-terraform-locks"

      - name: Terraform apply
        run: terraform apply -auto-approve

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "${{ job.status == 'success' && '✅' || '❌' }} Terraform apply ${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Terraform Apply* ${{ job.status }}\n*Commit:* <${{ github.event.head_commit.url }}|${{ github.sha }}>\n*Author:* ${{ github.actor }}"
                  }
                }
              ]
            }

  # ===========================================================================
  # Drift Detection (scheduled daily)
  # ===========================================================================
  drift-detection:
    name: Terraform Drift Detection
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'

    permissions:
      id-token: write
      contents: read

    defaults:
      run:
        working-directory: infrastructure

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsTerraformRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform init
        run: |
          terraform init \
            -backend-config="bucket={PROJECT_NAME}-terraform-state" \
            -backend-config="key=infrastructure/terraform.tfstate" \
            -backend-config="region=${{ env.AWS_REGION }}" \
            -backend-config="dynamodb_table={PROJECT_NAME}-terraform-locks"

      - name: Terraform plan (detect drift)
        id: drift
        run: |
          terraform plan -detailed-exitcode -no-color > drift-report.txt 2>&1
        continue-on-error: true

      - name: Alert on drift
        if: steps.drift.outcome == 'failure'
        uses: slackapi/slack-github-action@v1
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "⚠️ Terraform drift detected",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Terraform Drift Detected*\nInfrastructure has diverged from code. Review and reconcile.\n*Logs:* <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View drift report>"
                  }
                }
              ]
            }
```

---

## 9. Secret Management

Use GitHub Secrets for sensitive values. **Never** use long-lived AWS access keys—use OIDC instead.

### Required GitHub Secrets

| Secret Name | Description | Example Value |
|---|---|---|
| `AWS_ACCOUNT_ID` | AWS account ID | `123456789012` |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | `https://hooks.slack.com/services/...` |
| `NEXT_PUBLIC_API_URL` | Public API URL for UI builds | `https://api.{PROJECT_NAME}.company.com` |
| `PRIVATE_SUBNET_IDS` | Staging private subnet IDs (comma-separated) | `subnet-abc123,subnet-def456` |
| `MIGRATION_SG_ID` | Security group for migration tasks | `sg-abc123def` |
| `PROD_PRIVATE_SUBNET_IDS` | Production private subnet IDs | `subnet-xyz789,subnet-uvw012` |
| `PROD_MIGRATION_SG_ID` | Production migration security group | `sg-xyz789abc` |

### AWS OIDC Setup (No Long-Lived Keys)

Create an IAM OIDC identity provider and role for GitHub Actions:

```hcl
# infrastructure/github-oidc.tf

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_actions" {
  name = "GitHubActionsRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:{GITHUB_ORG}/{PROJECT_NAME}:*"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_actions_ecr" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
}

resource "aws_iam_role_policy_attachment" "github_actions_ecs" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonECS_FullAccess"
}
```

---

## 10. Build Caching

Aggressive caching reduces build times by 60-80%.

### Docker Layer Caching

Already configured in `.github/workflows/build.yml` using BuildKit:

```yaml
cache-from: type=registry,ref=${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:buildcache
cache-to: type=registry,ref=${{ env.ECR_REGISTRY }}/{PROJECT_NAME}-api:buildcache,mode=max
```

### Pip Caching

```yaml
- name: Set up Python
  uses: actions/setup-python@v5
  with:
    python-version: '3.11'
    cache: 'pip'  # Automatic pip caching
```

### npm Caching

```yaml
- name: Set up Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
    cache-dependency-path: src/web-ui/package-lock.json
```

### Next.js Build Cache

Add to Dockerfile.ui for persistent build cache:

```dockerfile
# Enable Next.js build cache
ENV NEXT_TELEMETRY_DISABLED 1
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build
```

---

## 11. Deployment Strategies

### Rolling Deployment (Default)

ECS gradually replaces tasks with new versions. Configured in ECS service:

```hcl
# infrastructure/ecs-service.tf
resource "aws_ecs_service" "api" {
  name            = "{PROJECT_NAME}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 3

  deployment_configuration {
    deployment_maximum_percent         = 200  # Can exceed desired count during rollout
    deployment_minimum_healthy_percent = 100  # Always keep 100% running
    deployment_circuit_breaker {
      enable   = true
      rollback = true  # Auto-rollback on failure
    }
  }

  health_check_grace_period_seconds = 60
}
```

### Blue-Green Deployment

Use AWS CodeDeploy with ECS:

```hcl
resource "aws_codedeploy_deployment_group" "api" {
  app_name               = aws_codedeploy_app.main.name
  deployment_group_name  = "{PROJECT_NAME}-api-blue-green"
  service_role_arn       = aws_iam_role.codedeploy.arn
  deployment_config_name = "CodeDeployDefault.ECSAllAtOnce"

  blue_green_deployment_config {
    terminate_blue_instances_on_deployment_success {
      action                           = "TERMINATE"
      termination_wait_time_in_minutes = 5
    }

    deployment_ready_option {
      action_on_timeout = "CONTINUE_DEPLOYMENT"
    }

    green_fleet_provisioning_option {
      action = "COPY_AUTO_SCALING_GROUP"
    }
  }

  ecs_service {
    cluster_name = aws_ecs_cluster.main.name
    service_name = aws_ecs_service.api.name
  }

  load_balancer_info {
    target_group_pair_info {
      prod_traffic_route {
        listener_arns = [aws_lb_listener.api.arn]
      }

      target_group {
        name = aws_lb_target_group.api_blue.name
      }

      target_group {
        name = aws_lb_target_group.api_green.name
      }
    }
  }
}
```

### Canary Deployment

Gradually shift traffic using ALB weighted target groups:

```hcl
resource "aws_lb_listener_rule" "canary" {
  listener_arn = aws_lb_listener.api.arn
  priority     = 100

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.api_stable.arn
        weight = 90  # 90% to stable version
      }

      target_group {
        arn    = aws_lb_target_group.api_canary.arn
        weight = 10  # 10% to canary
      }

      stickiness {
        enabled  = true
        duration = 600
      }
    }
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}
```

---

## 12. Rollback Procedures

### Automated Rollback

ECS deployment circuit breaker automatically rolls back failed deployments (configured in section 11).

### Manual Rollback

#### Option 1: Redeploy Previous Image

```bash
# Get previous image tag
aws ecr describe-images \
  --repository-name {PROJECT_NAME}-api \
  --query 'sort_by(imageDetails,& imagePushedAt)[-2].imageTags[0]' \
  --output text

# Trigger production deploy with previous tag
gh workflow run deploy-production.yml -f image_tag=<PREVIOUS_TAG>
```

#### Option 2: Rollback Task Definition

```bash
# List recent task definition revisions
aws ecs list-task-definitions \
  --family-prefix {PROJECT_NAME}-api \
  --sort DESC \
  --max-items 5

# Update service to previous revision
aws ecs update-service \
  --cluster {PROJECT_NAME}-production \
  --service {PROJECT_NAME}-api \
  --task-definition {PROJECT_NAME}-api:42  # Replace with previous revision
```

#### Option 3: Rollback Database Migration

```bash
# SSH into migration container or run locally
alembic downgrade -1  # Rollback 1 migration

# Or rollback to specific revision
alembic downgrade abc123def
```

---

## 13. Branch Protection

Configure in GitHub repository settings or via Terraform:

### `.github/branch-protection.tf` (via Terraform GitHub Provider)

```hcl
resource "github_branch_protection" "main" {
  repository_id = github_repository.main.node_id
  pattern       = "main"

  required_status_checks {
    strict   = true  # Require branches to be up to date
    contexts = [
      "Code Quality / Python Quality (black, isort, ruff, mypy)",
      "Code Quality / Frontend Quality (eslint, prettier, tsc)",
      "Code Quality / Security Scan (Semgrep, Trivy, npm audit)",
      "Tests / Backend Tests (Python)",
      "Tests / Frontend Tests (Jest)",
      "Terraform / Terraform Plan",
    ]
  }

  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = true
    required_approving_review_count = 2
  }

  required_linear_history = true
  enforce_admins          = true

  required_conversation_resolution = true
}
```

### CODEOWNERS

`.github/CODEOWNERS`:

```
# Default owners for everything in the repo
* @{GITHUB_ORG}/platform-team

# Backend code requires backend team approval
src/api/** @{GITHUB_ORG}/backend-team
src/auth/** @{GITHUB_ORG}/backend-team

# Frontend code requires frontend team approval
src/web-ui/** @{GITHUB_ORG}/frontend-team

# Infrastructure changes require SRE approval
infrastructure/** @{GITHUB_ORG}/sre-team
.github/workflows/** @{GITHUB_ORG}/sre-team

# Security-sensitive files require security team review
Dockerfile* @{GITHUB_ORG}/security-team
semgrep-rules/** @{GITHUB_ORG}/security-team
```

---

## 14. Notifications

### Slack Integration

Configure Slack webhook in GitHub Secrets: `SLACK_WEBHOOK_URL`

### Teams Integration (Alternative)

Replace Slack webhook action with Teams webhook:

```yaml
- name: Notify Teams on success
  if: success()
  uses: jdcargile/ms-teams-notification@v1.3
  with:
    github-token: ${{ github.token }}
    ms-teams-webhook-uri: ${{ secrets.TEAMS_WEBHOOK_URL }}
    notification-summary: "✅ Production deployment successful"
    notification-color: 28a745
```

### Email Notifications

Use AWS SES via SNS:

```yaml
- name: Send deployment email
  run: |
    aws sns publish \
      --topic-arn arn:aws:sns:${{ env.AWS_REGION }}:${{ secrets.AWS_ACCOUNT_ID }}:deployments \
      --subject "{PROJECT_TITLE} Production Deployment" \
      --message "Deployed ${{ github.sha }} to production by ${{ github.actor }}"
```

---

## 15. Dependency Updates

### Dependabot Configuration

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  # Python dependencies
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 5
    reviewers:
      - "{GITHUB_ORG}/backend-team"
    labels:
      - "dependencies"
      - "python"
    commit-message:
      prefix: "chore(deps)"
      include: "scope"

  # npm dependencies (frontend)
  - package-ecosystem: "npm"
    directory: "/src/web-ui"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 5
    reviewers:
      - "{GITHUB_ORG}/frontend-team"
    labels:
      - "dependencies"
      - "frontend"
    commit-message:
      prefix: "chore(deps)"
      include: "scope"

  # Docker base images
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "tuesday"
      time: "09:00"
    open-pull-requests-limit: 3
    reviewers:
      - "{GITHUB_ORG}/sre-team"
    labels:
      - "dependencies"
      - "docker"

  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "wednesday"
      time: "09:00"
    open-pull-requests-limit: 5
    reviewers:
      - "{GITHUB_ORG}/sre-team"
    labels:
      - "dependencies"
      - "ci-cd"
```

### Renovate Configuration (Alternative)

`renovate.json` (more flexible than Dependabot):

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "schedule": ["before 10am on monday"],
  "timezone": "America/New_York",
  "labels": ["dependencies"],
  "rangeStrategy": "bump",
  "separateMajorMinor": true,
  "packageRules": [
    {
      "matchManagers": ["pip_requirements"],
      "groupName": "Python dependencies",
      "reviewers": ["team:{GITHUB_ORG}/backend-team"]
    },
    {
      "matchManagers": ["npm"],
      "groupName": "npm dependencies",
      "reviewers": ["team:{GITHUB_ORG}/frontend-team"]
    },
    {
      "matchDepTypes": ["devDependencies"],
      "automerge": true,
      "automergeType": "pr",
      "requiredStatusChecks": null
    }
  ]
}
```

---

## 16. Release Management

### Semantic Versioning & Git Tagging

Use semantic-release to automate versioning based on commit messages:

### `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  release:
    name: Create Release
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for changelog

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install semantic-release
        run: |
          npm install -g semantic-release \
            @semantic-release/changelog \
            @semantic-release/git \
            @semantic-release/github

      - name: Run semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: semantic-release
```

### `.releaserc.json` (semantic-release config)

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        "changelogFile": "CHANGELOG.md"
      }
    ],
    [
      "@semantic-release/git",
      {
        "assets": ["CHANGELOG.md", "package.json"],
        "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }
    ],
    "@semantic-release/github"
  ]
}
```

### Commit Message Convention

Follow Conventional Commits for automatic versioning:

```
feat: add user authentication (minor version bump)
fix: resolve database connection timeout (patch version bump)
feat!: migrate to Python 3.12 (major version bump)
chore: update dependencies (no version bump)
docs: update API documentation (no version bump)
```

### Manual Release Tagging

For projects not using semantic-release:

```bash
# Create annotated tag
git tag -a v1.2.3 -m "Release v1.2.3 - Fix critical security vulnerability"
git push origin v1.2.3

# Create GitHub release
gh release create v1.2.3 \
  --title "v1.2.3" \
  --notes "## Changes\n- Fixed CVE-2024-1234\n- Updated dependencies" \
  --latest
```

---

## 17. Validation Checklist

Use this checklist to validate your CI/CD pipeline is production-ready:

### Pre-Deployment Validation

- [ ] All workflows in `.github/workflows/` are syntactically valid (use `actionlint`)
- [ ] GitHub Secrets are configured (`AWS_ACCOUNT_ID`, `SLACK_WEBHOOK_URL`, etc.)
- [ ] AWS OIDC provider and IAM role are created
- [ ] ECR repositories exist for API, UI, Scanner images
- [ ] ECS clusters exist for staging and production
- [ ] Terraform state backend (S3 + DynamoDB) is configured
- [ ] Branch protection rules are enabled on `main`
- [ ] CODEOWNERS file is committed
- [ ] Dependabot or Renovate is configured
- [ ] Slack/Teams webhook is tested and working

### Build & Test Validation

- [ ] Code quality workflow passes on a test PR
- [ ] Tests workflow passes with PostgreSQL and Redis services
- [ ] Docker images build successfully and push to ECR
- [ ] Image vulnerability scanning completes without critical issues
- [ ] Terraform plan runs without errors on infrastructure changes

### Deployment Validation

- [ ] Staging deployment completes and health checks pass
- [ ] Database migrations run successfully in staging
- [ ] Smoke tests pass after staging deployment
- [ ] Production deployment requires manual approval
- [ ] Production health checks pass after deployment
- [ ] Rollback procedure works (test in staging)

### Security Validation

- [ ] No long-lived AWS access keys in GitHub Secrets
- [ ] OIDC authentication is used for AWS access
- [ ] ECR images are scanned on push
- [ ] Semgrep security rules run on every PR
- [ ] Secrets are not committed to repository (use `git-secrets` or `truffleHog`)
- [ ] Container images run as non-root user

### Operational Validation

- [ ] Slack/Teams notifications arrive for deployments
- [ ] Terraform drift detection runs daily
- [ ] Dependabot PRs are created weekly
- [ ] GitHub Actions usage is within limits (check billing)
- [ ] ECS deployment logs are accessible in CloudWatch
- [ ] Terraform state is locked during concurrent runs

### Performance Validation

- [ ] Build caching reduces Docker build time by >50%
- [ ] pip/npm caching reduces dependency install time
- [ ] Code quality checks complete in <5 minutes
- [ ] Full test suite completes in <10 minutes
- [ ] Staging deployment completes in <5 minutes
- [ ] Production deployment completes in <10 minutes

---

## Summary

This CI/CD pipeline plan provides a complete, production-ready automation framework covering:

1. **Code Quality** — Automated linting, formatting, type checking, and security scanning
2. **Testing** — Comprehensive unit and integration tests with coverage reporting
3. **Builds** — Multi-stage Docker builds with aggressive layer caching
4. **Deployments** — Automated staging deploys, manual production approvals, health checks, and rollbacks
5. **Infrastructure** — Terraform automation with state locking and drift detection
6. **Security** — OIDC authentication, vulnerability scanning, no long-lived credentials
7. **Operations** — Notifications, dependency updates, release management, monitoring

**Next Steps:**
1. Create `.github/workflows/` directory and copy workflow files
2. Configure GitHub Secrets and AWS OIDC provider
3. Test each workflow independently before enabling branch protection
4. Deploy to staging first, validate thoroughly, then enable production deployments
5. Monitor GitHub Actions usage and optimize caching for cost efficiency

All workflows are parameterized with `{PLACEHOLDER}` patterns for easy adaptation to any project following the AuditGH reference architecture.
