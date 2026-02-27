# Phase 11: AWS Infrastructure Plan

> **Purpose:** Deploy a production-ready AWS infrastructure for a Python/FastAPI backend and Next.js frontend using Terraform, ECS Fargate, RDS PostgreSQL, ElastiCache Redis, and all supporting services. This plan provides complete Terraform HCL code for VPC, security groups, compute, data stores, load balancing, IAM, monitoring, and cost optimization. All patterns are parameterized with `{PLACEHOLDER}` syntax for reusability across any project.
>
> **Reference Implementation:** [AuditGH on AWS ECS Fargate](https://github.com/sleepnumber/auditgh) -- all infrastructure patterns, module organization, security configurations, and operational best practices are derived from AuditGH's production deployment.

---

## Placeholder Legend

| Placeholder | Description | Example (AuditGH) |
|---|---|---|
| `{PROJECT_NAME}` | Lowercase project identifier | `auditgithub` |
| `{ENVIRONMENT}` | Environment name | `dev`, `staging`, `prod` |
| `{AWS_REGION}` | AWS region for deployment | `us-east-1` |
| `{AWS_ACCOUNT_ID}` | AWS account ID | `123456789012` |
| `{DOMAIN_NAME}` | Domain name for the application | `auditgh.example.com` |
| `{VPC_CIDR}` | VPC CIDR block | `10.0.0.0/16` |
| `{AVAILABILITY_ZONES}` | List of availability zones | `["us-east-1a", "us-east-1b", "us-east-1c"]` |
| `{DB_INSTANCE_CLASS}` | RDS instance class | `db.t3.medium` |
| `{CACHE_NODE_TYPE}` | ElastiCache node type | `cache.t3.micro` |
| `{API_TASK_CPU}` | API task CPU units (1024 = 1 vCPU) | `1024` |
| `{API_TASK_MEMORY}` | API task memory in MB | `2048` |
| `{GITHUB_ORG}` | GitHub organization name | `sleepnumber` |
| `{GITHUB_REPO}` | GitHub repository name | `sleepnumber/auditgithub` |
| `{OWNER_EMAIL}` | Infrastructure owner email | `platform@company.com` |

---

## Section 1: Terraform Project Structure

### 1.1 Directory Layout

```
infrastructure/
├── terraform/
│   ├── main.tf                    # Root module orchestration
│   ├── variables.tf               # Input variables
│   ├── outputs.tf                 # Output values
│   ├── versions.tf                # Provider versions and backend config
│   ├── terraform.tfvars           # Default variable values (non-sensitive)
│   ├── environments/
│   │   ├── dev.tfvars            # Dev environment overrides
│   │   ├── staging.tfvars        # Staging environment overrides
│   │   └── prod.tfvars           # Production environment overrides
│   └── modules/
│       ├── vpc/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── security-groups/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── rds/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── elasticache/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── ecr/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── ecs-cluster/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── ecs-service/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── alb/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── iam/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       └── s3/
│           ├── main.tf
│           ├── variables.tf
│           └── outputs.tf
```

### 1.2 Module Organization Philosophy

- **Reusable Modules**: Each AWS service is encapsulated in a module for reusability across environments
- **Single Responsibility**: Modules focus on a specific infrastructure concern (VPC, RDS, ECS, etc.)
- **Composable**: Root module orchestrates modules and handles cross-module dependencies
- **Environment Agnostic**: Modules use variables for environment-specific configuration
- **Output-Driven**: Modules expose outputs for other modules to consume

---

## Section 2: Remote State Configuration

### 2.1 Backend Configuration (`versions.tf`)

```hcl
terraform {
  required_version = ">= 1.5.0"

  # Remote state backend (S3 + DynamoDB locking)
  backend "s3" {
    bucket         = "{PROJECT_NAME}-terraform-state"
    key            = "{ENVIRONMENT}/terraform.tfstate"
    region         = "{AWS_REGION}"
    encrypt        = true
    dynamodb_table = "{PROJECT_NAME}-terraform-locks"

    # Enable versioning on the bucket
    versioning = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "{PROJECT_NAME}"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = var.owner_email
    }
  }
}
```

### 2.2 State Bucket Setup (One-Time Manual Setup)

```bash
#!/bin/bash
# Create S3 bucket for Terraform state
aws s3api create-bucket \
  --bucket {PROJECT_NAME}-terraform-state \
  --region {AWS_REGION}

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket {PROJECT_NAME}-terraform-state \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket {PROJECT_NAME}-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket {PROJECT_NAME}-terraform-state \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name {PROJECT_NAME}-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region {AWS_REGION}
```

---

## Section 3: VPC Module

### 3.1 VPC Module (`modules/vpc/main.tf`)

```hcl
# VPC with DNS support
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-vpc"
    }
  )
}

# Internet Gateway for public subnets
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-igw"
    }
  )
}

# Public Subnets (for ALB)
resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-public-subnet-${count.index + 1}"
      Tier = "Public"
    }
  )
}

# Private Subnets (for ECS, RDS, Redis)
resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + length(var.availability_zones))
  availability_zone = var.availability_zones[count.index]

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-private-subnet-${count.index + 1}"
      Tier = "Private"
    }
  )
}

# Elastic IPs for NAT Gateways (one per AZ for HA)
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? length(var.availability_zones) : 0
  domain = "vpc"

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nat-eip-${count.index + 1}"
    }
  )

  depends_on = [aws_internet_gateway.main]
}

# NAT Gateways (one per AZ for HA)
resource "aws_nat_gateway" "main" {
  count         = var.enable_nat_gateway ? length(var.availability_zones) : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nat-gateway-${count.index + 1}"
    }
  )

  depends_on = [aws_internet_gateway.main]
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-public-rt"
      Tier = "Public"
    }
  )
}

# Public Route to Internet Gateway
resource "aws_route" "public_internet_gateway" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

# Public Route Table Associations
resource "aws_route_table_association" "public" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private Route Tables (one per AZ for redundancy)
resource "aws_route_table" "private" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.main.id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-private-rt-${count.index + 1}"
      Tier = "Private"
    }
  )
}

# Private Routes to NAT Gateway
resource "aws_route" "private_nat_gateway" {
  count                  = var.enable_nat_gateway ? length(var.availability_zones) : 0
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[count.index].id
}

# Private Route Table Associations
resource "aws_route_table_association" "private" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC Flow Logs for network traffic analysis
resource "aws_flow_log" "main" {
  count                = var.enable_flow_logs ? 1 : 0
  iam_role_arn         = aws_iam_role.flow_logs[0].arn
  log_destination      = aws_cloudwatch_log_group.flow_logs[0].arn
  traffic_type         = "ALL"
  vpc_id               = aws_vpc.main.id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-flow-logs"
    }
  )
}

# CloudWatch Log Group for Flow Logs
resource "aws_cloudwatch_log_group" "flow_logs" {
  count             = var.enable_flow_logs ? 1 : 0
  name              = "/aws/vpc/${var.name_prefix}-flow-logs"
  retention_in_days = var.flow_logs_retention_days

  tags = var.tags
}

# IAM Role for Flow Logs
resource "aws_iam_role" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.name_prefix}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# IAM Policy for Flow Logs
resource "aws_iam_role_policy" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.name_prefix}-vpc-flow-logs-policy"
  role  = aws_iam_role.flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}
```

### 3.2 VPC Module Variables (`modules/vpc/variables.tf`)

```hcl
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Enable NAT gateway for private subnets"
  type        = bool
  default     = true
}

variable "enable_flow_logs" {
  description = "Enable VPC flow logs"
  type        = bool
  default     = true
}

variable "flow_logs_retention_days" {
  description = "Retention period for VPC flow logs"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
```

### 3.3 VPC Module Outputs (`modules/vpc/outputs.tf`)

```hcl
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnets" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnets" {
  description = "IDs of private subnets"
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ips" {
  description = "Elastic IPs of NAT gateways"
  value       = aws_eip.nat[*].public_ip
}
```

---

## Section 4: Security Groups Module

### 4.1 Security Groups Module (`modules/security-groups/main.tf`)

```hcl
# Application Load Balancer Security Group
resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-alb-"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-alb-sg"
    }
  )
}

# ALB Ingress: HTTP from internet
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow HTTP from internet"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

# ALB Ingress: HTTPS from internet
resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow HTTPS from internet"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

# ALB Egress: Allow all outbound
resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow all outbound traffic"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ECS Tasks Security Group
resource "aws_security_group" "ecs" {
  name_prefix = "${var.name_prefix}-ecs-"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-ecs-sg"
    }
  )
}

# ECS Ingress: API port from ALB
resource "aws_vpc_security_group_ingress_rule" "ecs_api" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "Allow API traffic from ALB"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"
}

# ECS Ingress: Web UI port from ALB
resource "aws_vpc_security_group_ingress_rule" "ecs_webui" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "Allow Web UI traffic from ALB"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

# ECS Egress: Allow all outbound (for external APIs, package downloads)
resource "aws_vpc_security_group_egress_rule" "ecs_all" {
  security_group_id = aws_security_group.ecs.id
  description       = "Allow all outbound traffic"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# RDS PostgreSQL Security Group
resource "aws_security_group" "rds" {
  name_prefix = "${var.name_prefix}-rds-"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-rds-sg"
    }
  )
}

# RDS Ingress: PostgreSQL from ECS
resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  description                  = "Allow PostgreSQL from ECS tasks"
  referenced_security_group_id = aws_security_group.ecs.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

# RDS Egress: Not typically needed, but allow for maintenance
resource "aws_vpc_security_group_egress_rule" "rds_all" {
  security_group_id = aws_security_group.rds.id
  description       = "Allow all outbound traffic"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ElastiCache Redis Security Group
resource "aws_security_group" "redis" {
  name_prefix = "${var.name_prefix}-redis-"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-sg"
    }
  )
}

# Redis Ingress: Redis from ECS
resource "aws_vpc_security_group_ingress_rule" "redis_from_ecs" {
  security_group_id            = aws_security_group.redis.id
  description                  = "Allow Redis from ECS tasks"
  referenced_security_group_id = aws_security_group.ecs.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
}

# Redis Egress: Not typically needed
resource "aws_vpc_security_group_egress_rule" "redis_all" {
  security_group_id = aws_security_group.redis.id
  description       = "Allow all outbound traffic"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
```

### 4.2 Security Groups Module Variables and Outputs

```hcl
# variables.tf
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "alb_sg_id" {
  description = "ID of ALB security group"
  value       = aws_security_group.alb.id
}

output "ecs_sg_id" {
  description = "ID of ECS security group"
  value       = aws_security_group.ecs.id
}

output "rds_sg_id" {
  description = "ID of RDS security group"
  value       = aws_security_group.rds.id
}

output "redis_sg_id" {
  description = "ID of Redis security group"
  value       = aws_security_group.redis.id
}
```

---

## Section 5: RDS PostgreSQL Module

### 5.1 RDS Module (`modules/rds/main.tf`)

```hcl
# DB Subnet Group (spans multiple AZs)
resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-db-subnet-group"
  subnet_ids = var.private_subnets

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-subnet-group"
    }
  )
}

# DB Parameter Group for PostgreSQL optimization
resource "aws_db_parameter_group" "main" {
  name_prefix = "${var.name_prefix}-pg-"
  family      = var.parameter_group_family

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_duration"
    value = "1"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "max_connections"
    value = var.max_connections
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# Random password for master user
resource "random_password" "master" {
  length  = 32
  special = true
}

# Store password in Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name        = "${var.name_prefix}/db/password"
  description = "Master password for RDS PostgreSQL database"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.master.result
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "main" {
  identifier     = "${var.name_prefix}-db"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = var.storage_type
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_name  = var.database_name
  username = var.master_username
  password = random_password.master.result
  port     = 5432

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.security_groups
  publicly_accessible    = false

  parameter_group_name = aws_db_parameter_group.main.name

  backup_retention_period = var.backup_retention_period
  backup_window           = var.backup_window
  maintenance_window      = var.maintenance_window
  copy_tags_to_snapshot   = true
  skip_final_snapshot     = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-db-final-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = var.performance_insights_enabled
  performance_insights_retention_period = var.performance_insights_enabled ? 7 : null

  auto_minor_version_upgrade = var.auto_minor_version_upgrade
  deletion_protection        = var.deletion_protection

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db"
    }
  )

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}

# CloudWatch Alarms for RDS
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${var.name_prefix}-db-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Database CPU utilization is too high"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_name          = "${var.name_prefix}-db-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "10000000000" # 10GB
  alarm_description   = "Database free storage space is low"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = var.tags
}
```

### 5.2 RDS Module Variables and Outputs

```hcl
# variables.tf
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "private_subnets" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "security_groups" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "database_name" {
  description = "Name of the database"
  type        = string
}

variable "master_username" {
  description = "Master username"
  type        = string
  default     = "postgres"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 100
}

variable "max_allocated_storage" {
  description = "Maximum allocated storage for autoscaling"
  type        = number
  default     = 500
}

variable "storage_type" {
  description = "Storage type (gp3, gp2, io1)"
  type        = string
  default     = "gp3"
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "parameter_group_family" {
  description = "DB parameter group family"
  type        = string
  default     = "postgres15"
}

variable "max_connections" {
  description = "Max database connections"
  type        = string
  default     = "200"
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "backup_window" {
  description = "Backup window"
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "Maintenance window"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on deletion"
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}

variable "performance_insights_enabled" {
  description = "Enable Performance Insights"
  type        = bool
  default     = true
}

variable "auto_minor_version_upgrade" {
  description = "Enable automatic minor version upgrades"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}

output "address" {
  description = "RDS hostname"
  value       = aws_db_instance.main.address
}

output "port" {
  description = "RDS port"
  value       = aws_db_instance.main.port
}

output "database_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}
```

---

## Section 6: ElastiCache Redis Module

### 6.1 ElastiCache Module (`modules/elasticache/main.tf`)

```hcl
# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.name_prefix}-redis-subnet-group"
  subnet_ids = var.private_subnets

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis-subnet-group"
    }
  )
}

# ElastiCache Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  name_prefix = "${var.name_prefix}-redis-"
  family      = var.parameter_group_family

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# Random auth token for Redis
resource "random_password" "auth_token" {
  count   = var.transit_encryption_enabled ? 1 : 0
  length  = 32
  special = false
}

# Store auth token in Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth_token" {
  count       = var.transit_encryption_enabled ? 1 : 0
  name        = "${var.name_prefix}/redis/auth-token"
  description = "Auth token for Redis cluster"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  count         = var.transit_encryption_enabled ? 1 : 0
  secret_id     = aws_secretsmanager_secret.redis_auth_token[0].id
  secret_string = random_password.auth_token[0].result
}

# ElastiCache Replication Group (Redis Cluster)
resource "aws_elasticache_replication_group" "main" {
  replication_group_id          = "${var.name_prefix}-redis"
  replication_group_description = "Redis cluster for ${var.name_prefix}"

  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_nodes
  port                 = 6379

  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = var.security_groups

  automatic_failover_enabled = var.num_cache_nodes > 1 ? true : false
  multi_az_enabled           = var.num_cache_nodes > 1 ? true : false

  at_rest_encryption_enabled = true
  transit_encryption_enabled = var.transit_encryption_enabled
  auth_token_enabled         = var.transit_encryption_enabled
  auth_token                 = var.transit_encryption_enabled ? random_password.auth_token[0].result : null
  kms_key_id                 = var.kms_key_arn

  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_window          = var.snapshot_window
  maintenance_window       = var.maintenance_window

  auto_minor_version_upgrade = var.auto_minor_version_upgrade

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.engine_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-redis"
    }
  )

  lifecycle {
    ignore_changes = [auth_token]
  }
}

# CloudWatch Log Groups for Redis
resource "aws_cloudwatch_log_group" "slow_log" {
  name              = "/aws/elasticache/${var.name_prefix}-redis/slow-log"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "engine_log" {
  name              = "/aws/elasticache/${var.name_prefix}-redis/engine-log"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# CloudWatch Alarms for Redis
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.name_prefix}-redis-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "Redis CPU utilization is too high"

  dimensions = {
    CacheClusterId = "${var.name_prefix}-redis-001"
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.name_prefix}-redis-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Redis memory usage is too high"

  dimensions = {
    CacheClusterId = "${var.name_prefix}-redis-001"
  }

  tags = var.tags
}
```

### 6.2 ElastiCache Module Variables and Outputs

```hcl
# variables.tf
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "private_subnets" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "security_groups" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

variable "parameter_group_family" {
  description = "Parameter group family"
  type        = string
  default     = "redis7"
}

variable "transit_encryption_enabled" {
  description = "Enable encryption in transit"
  type        = bool
  default     = true
}

variable "snapshot_retention_limit" {
  description = "Number of days to retain snapshots"
  type        = number
  default     = 5
}

variable "snapshot_window" {
  description = "Snapshot window"
  type        = string
  default     = "03:00-05:00"
}

variable "maintenance_window" {
  description = "Maintenance window"
  type        = string
  default     = "sun:05:00-sun:07:00"
}

variable "auto_minor_version_upgrade" {
  description = "Enable automatic minor version upgrades"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "reader_endpoint" {
  description = "Redis reader endpoint"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "port" {
  description = "Redis port"
  value       = aws_elasticache_replication_group.main.port
}
```

---

## Section 7: ECR Module

### 7.1 ECR Module (`modules/ecr/main.tf`)

```hcl
locals {
  repositories = toset(var.repositories)
}

# ECR Repositories for container images
resource "aws_ecr_repository" "main" {
  for_each = local.repositories
  name     = "${var.name_prefix}-${each.value}"

  image_scanning_configuration {
    scan_on_push = var.scan_on_push
  }

  image_tag_mutability = var.image_tag_mutability

  encryption_configuration {
    encryption_type = var.encryption_type
    kms_key         = var.kms_key_arn
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-${each.value}"
    }
  )
}

# Lifecycle Policy to clean up old images (retain last N images)
resource "aws_ecr_lifecycle_policy" "main" {
  for_each   = local.repositories
  repository = aws_ecr_repository.main[each.value].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last ${var.max_image_count} images"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = var.max_image_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
```

### 7.2 ECR Module Variables and Outputs

```hcl
# variables.tf
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "repositories" {
  description = "List of ECR repository names"
  type        = list(string)
  default     = ["api", "web-ui", "worker"]
}

variable "scan_on_push" {
  description = "Enable image scanning on push"
  type        = bool
  default     = true
}

variable "image_tag_mutability" {
  description = "Image tag mutability (MUTABLE or IMMUTABLE)"
  type        = string
  default     = "MUTABLE"
}

variable "encryption_type" {
  description = "Encryption type (AES256 or KMS)"
  type        = string
  default     = "AES256"
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
  default     = null
}

variable "max_image_count" {
  description = "Maximum number of images to retain"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "repository_urls" {
  description = "Map of repository names to URLs"
  value = {
    for name, repo in aws_ecr_repository.main : name => repo.repository_url
  }
}

output "repository_arns" {
  description = "Map of repository names to ARNs"
  value = {
    for name, repo in aws_ecr_repository.main : name => repo.arn
  }
}
```

---

## Section 8: ECS Cluster Module

### 8.1 ECS Cluster Module (`modules/ecs-cluster/main.tf`)

```hcl
# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enabled" : "disabled"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-cluster"
    }
  )
}

# Fargate Capacity Providers (Fargate + Fargate Spot)
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = var.fargate_weight
    base              = var.fargate_base
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = var.fargate_spot_weight
  }
}

# CloudWatch Log Group for ECS
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}
```

### 8.2 ECS Cluster Module Variables and Outputs

```hcl
# variables.tf
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "enable_container_insights" {
  description = "Enable CloudWatch Container Insights"
  type        = bool
  default     = true
}

variable "fargate_weight" {
  description = "Weight for Fargate capacity provider"
  type        = number
  default     = 1
}

variable "fargate_base" {
  description = "Base number of tasks on Fargate (not Spot)"
  type        = number
  default     = 1
}

variable "fargate_spot_weight" {
  description = "Weight for Fargate Spot capacity provider"
  type        = number
  default     = 1
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}
```

---

## Section 9: ECS Service Module

### 9.1 ECS Service Module (`modules/ecs-service/main.tf`)

```hcl
# CloudWatch Log Group for the service
resource "aws_cloudwatch_log_group" "service" {
  name              = "/ecs/${var.cluster_name}/${var.service_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# ECS Task Definition
resource "aws_ecs_task_definition" "main" {
  family                   = "${var.cluster_name}-${var.service_name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = var.service_name
      image     = var.container_image
      essential = true

      portMappings = var.container_port != null ? [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ] : []

      environment = [
        for key, value in var.environment : {
          name  = key
          value = tostring(value)
        }
      ]

      secrets = [
        for key, secret_arn in var.secrets : {
          name      = key
          valueFrom = secret_arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.service.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = var.health_check

      ulimits = [
        {
          name      = "nofile"
          softLimit = 65536
          hardLimit = 65536
        }
      ]
    }
  ])

  tags = merge(
    var.tags,
    {
      Name = "${var.cluster_name}-${var.service_name}"
    }
  )
}

# ECS Service
resource "aws_ecs_service" "main" {
  name            = "${var.service_name}-service"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  platform_version = "LATEST"

  network_configuration {
    subnets          = var.private_subnets
    security_groups  = var.security_groups
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = var.alb_target_group_arn != null ? [1] : []
    content {
      target_group_arn = var.alb_target_group_arn
      container_name   = var.service_name
      container_port   = var.container_port
    }
  }

  health_check_grace_period_seconds = var.alb_target_group_arn != null ? 60 : null

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
  }

  enable_execute_command = var.enable_execute_command

  propagate_tags = "SERVICE"

  tags = merge(
    var.tags,
    {
      Name = "${var.service_name}-service"
    }
  )

  depends_on = [aws_ecs_task_definition.main]

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}

# Auto Scaling Target
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_count
  min_capacity       = var.min_count
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Auto Scaling Policy - CPU
resource "aws_appautoscaling_policy" "ecs_cpu" {
  name               = "${var.service_name}-cpu-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Auto Scaling Policy - Memory
resource "aws_appautoscaling_policy" "ecs_memory" {
  name               = "${var.service_name}-memory-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### 9.2 ECS Service Module Variables and Outputs

```hcl
# variables.tf
variable "cluster_id" {
  description = "ECS cluster ID"
  type        = string
}

variable "cluster_name" {
  description = "ECS cluster name"
  type        = string
}

variable "service_name" {
  description = "Name of the ECS service"
  type        = string
}

variable "container_image" {
  description = "Container image URL"
  type        = string
}

variable "container_port" {
  description = "Container port"
  type        = number
  default     = null
}

variable "task_cpu" {
  description = "Task CPU units (1024 = 1 vCPU)"
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Task memory in MB"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Desired number of tasks"
  type        = number
  default     = 1
}

variable "min_count" {
  description = "Minimum number of tasks"
  type        = number
  default     = 1
}

variable "max_count" {
  description = "Maximum number of tasks"
  type        = number
  default     = 4
}

variable "private_subnets" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "security_groups" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "execution_role_arn" {
  description = "ECS execution role ARN"
  type        = string
}

variable "task_role_arn" {
  description = "ECS task role ARN"
  type        = string
}

variable "alb_target_group_arn" {
  description = "ALB target group ARN"
  type        = string
  default     = null
}

variable "environment" {
  description = "Environment variables"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secret ARNs"
  type        = map(string)
  default     = {}
}

variable "health_check" {
  description = "Container health check configuration"
  type = object({
    command     = list(string)
    interval    = number
    timeout     = number
    retries     = number
    startPeriod = number
  })
  default = null
}

variable "enable_execute_command" {
  description = "Enable ECS Exec"
  type        = bool
  default     = false
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.main.name
}

output "service_arn" {
  description = "ECS service ARN"
  value       = aws_ecs_service.main.id
}

output "task_definition_arn" {
  description = "Task definition ARN"
  value       = aws_ecs_task_definition.main.arn
}
```

---

## Section 10: Application Load Balancer Module

### 10.1 ALB Module (`modules/alb/main.tf`)

```hcl
# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${var.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = var.security_groups
  subnets            = var.public_subnets

  enable_deletion_protection       = var.enable_deletion_protection
  enable_http2                     = true
  enable_cross_zone_load_balancing = true

  access_logs {
    bucket  = var.access_logs_bucket
    prefix  = "alb"
    enabled = var.access_logs_bucket != null
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-alb"
    }
  )
}

# Target Group for API Service
resource "aws_lb_target_group" "api" {
  name_prefix = "api-"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-api-tg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Target Group for Web UI Service
resource "aws_lb_target_group" "webui" {
  name_prefix = "webui-"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-webui-tg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# HTTP Listener (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = var.tags
}

# HTTPS Listener
resource "aws_lb_listener" "https" {
  count               = var.certificate_arn != null ? 1 : 0
  load_balancer_arn   = aws_lb.main.arn
  port                = 443
  protocol            = "HTTPS"
  ssl_policy          = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn     = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.webui.arn
  }

  tags = var.tags
}

# HTTPS Listener Rule for API
resource "aws_lb_listener_rule" "api" {
  count        = var.certificate_arn != null ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/docs", "/openapi.json"]
    }
  }

  tags = var.tags
}

# WAF Web ACL (optional)
resource "aws_wafv2_web_acl" "main" {
  count = var.enable_waf ? 1 : 0
  name  = "${var.name_prefix}-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "RateLimitRule"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

# Associate WAF with ALB
resource "aws_wafv2_web_acl_association" "main" {
  count        = var.enable_waf ? 1 : 0
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main[0].arn
}
```

### 10.2 ALB Module Variables and Outputs

```hcl
# variables.tf
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnets" {
  description = "List of public subnet IDs"
  type        = list(string)
}

variable "security_groups" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "certificate_arn" {
  description = "ACM certificate ARN"
  type        = string
  default     = null
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = false
}

variable "access_logs_bucket" {
  description = "S3 bucket for access logs"
  type        = string
  default     = null
}

variable "enable_waf" {
  description = "Enable AWS WAF"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID"
  value       = aws_lb.main.zone_id
}

output "api_target_group_arn" {
  description = "API target group ARN"
  value       = aws_lb_target_group.api.arn
}

output "webui_target_group_arn" {
  description = "Web UI target group ARN"
  value       = aws_lb_target_group.webui.arn
}
```

---

## Section 11: IAM Module

### 11.1 IAM Module (`modules/iam/main.tf`)

```hcl
# ECS Task Execution Role (used by ECS agent to pull images, fetch secrets)
resource "aws_iam_role" "ecs_execution" {
  name = "${var.name_prefix}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-ecs-execution-role"
    }
  )
}

# Attach AWS managed policy for ECS task execution
resource "aws_iam_role_policy_attachment" "ecs_execution_policy" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Additional policy for Secrets Manager access
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${var.name_prefix}-ecs-execution-secrets-policy"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:{AWS_REGION}:{AWS_ACCOUNT_ID}:secret:${var.name_prefix}*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })
}

# ECS Task Role (used by the application running in the container)
resource "aws_iam_role" "ecs_task" {
  name = "${var.name_prefix}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-ecs-task-role"
    }
  )
}

# S3 Access Policy for ECS Tasks
resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "${var.name_prefix}-ecs-task-s3-policy"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = var.s3_bucket_arns
      }
    ]
  })
}

# Secrets Manager Access Policy for ECS Tasks
resource "aws_iam_role_policy" "ecs_task_secrets" {
  name = "${var.name_prefix}-ecs-task-secrets-policy"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:{AWS_REGION}:{AWS_ACCOUNT_ID}:secret:${var.name_prefix}*"
      }
    ]
  })
}

# CloudWatch Logs Policy for ECS Tasks
resource "aws_iam_role_policy" "ecs_task_logs" {
  name = "${var.name_prefix}-ecs-task-logs-policy"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:{AWS_REGION}:{AWS_ACCOUNT_ID}:log-group:/ecs/${var.name_prefix}*"
      }
    ]
  })
}
```

### 11.2 IAM Module Variables and Outputs

```hcl
# variables.tf
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "s3_bucket_arns" {
  description = "List of S3 bucket ARNs (including /*)"
  type        = list(string)
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "ecs_execution_role_arn" {
  description = "ECS execution role ARN"
  value       = aws_iam_role.ecs_execution.arn
}

output "ecs_task_role_arn" {
  description = "ECS task role ARN"
  value       = aws_iam_role.ecs_task.arn
}
```

---

## Section 12: S3 Module

### 12.1 S3 Module (`modules/s3/main.tf`)

```hcl
# Reports Bucket
resource "aws_s3_bucket" "reports" {
  bucket = "${var.name_prefix}-reports-{AWS_ACCOUNT_ID}"

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-reports"
      Type = "Reports"
    }
  )
}

# Reports Bucket Versioning
resource "aws_s3_bucket_versioning" "reports" {
  bucket = aws_s3_bucket.reports.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Reports Bucket Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Reports Bucket Public Access Block
resource "aws_s3_bucket_public_access_block" "reports" {
  bucket = aws_s3_bucket.reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Reports Bucket Lifecycle Policy
resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "transition-old-reports"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

# Logs Bucket
resource "aws_s3_bucket" "logs" {
  bucket = "${var.name_prefix}-logs-{AWS_ACCOUNT_ID}"

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-logs"
      Type = "Logs"
    }
  )
}

# Logs Bucket Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Logs Bucket Public Access Block
resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Logs Bucket Lifecycle Policy
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "transition-old-logs"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    expiration {
      days = 90
    }
  }
}
```

### 12.2 S3 Module Variables and Outputs

```hcl
# variables.tf
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "reports_bucket_name" {
  description = "Reports bucket name"
  value       = aws_s3_bucket.reports.id
}

output "reports_bucket_arn" {
  description = "Reports bucket ARN"
  value       = aws_s3_bucket.reports.arn
}

output "logs_bucket_name" {
  description = "Logs bucket name"
  value       = aws_s3_bucket.logs.id
}

output "logs_bucket_arn" {
  description = "Logs bucket ARN"
  value       = aws_s3_bucket.logs.arn
}
```

---

## Section 13: DNS & SSL Configuration

### 13.1 Route 53 and ACM Setup

```hcl
# In root main.tf or separate dns module

# Route 53 Hosted Zone (assumes zone already exists)
data "aws_route53_zone" "main" {
  name         = "{DOMAIN_NAME}"
  private_zone = false
}

# ACM Certificate
resource "aws_acm_certificate" "main" {
  domain_name       = "{DOMAIN_NAME}"
  validation_method = "DNS"

  subject_alternative_names = [
    "*.{DOMAIN_NAME}"
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# DNS Validation Records
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

# Certificate Validation
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# A Record for ALB
resource "aws_route53_record" "alb" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "{DOMAIN_NAME}"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}
```

---

## Section 14: Secrets Management

### 14.1 Secrets Manager Integration

```hcl
# In root main.tf

# Database Password (already created in RDS module)
# Reference: module.rds creates this automatically

# GitHub Token (for API integrations)
resource "aws_secretsmanager_secret" "github_token" {
  name        = "${local.name_prefix}/github/token"
  description = "GitHub personal access token"

  tags = local.common_tags
}

# Application Secrets Master Key
resource "aws_secretsmanager_secret" "secrets_master_key" {
  name        = "${local.name_prefix}/secrets/master-key"
  description = "Master key for application-level encryption"

  tags = local.common_tags
}

# API Keys (if needed)
resource "aws_secretsmanager_secret" "api_keys" {
  name        = "${local.name_prefix}/api/keys"
  description = "API keys for external services"

  tags = local.common_tags
}

# Note: Secret values must be populated manually or via CI/CD
# Example CLI command:
# aws secretsmanager put-secret-value \
#   --secret-id {PROJECT_NAME}-{ENVIRONMENT}/github/token \
#   --secret-string "ghp_your_token_here"
```

### 14.2 ECS Task Secrets Configuration

Secrets are referenced in the ECS service module (Section 9) using the `secrets` parameter:

```hcl
module "ecs_api_service" {
  # ... other configuration

  secrets = {
    POSTGRES_PASSWORD  = "${local.name_prefix}/db/password"
    GITHUB_TOKEN       = "${local.name_prefix}/github/token"
    SECRETS_MASTER_KEY = "${local.name_prefix}/secrets/master-key"
  }
}
```

---

## Section 15: Environment Promotion

### 15.1 Environment Variable Files

Create `environments/dev.tfvars`:

```hcl
environment = "dev"
aws_region  = "us-east-1"
owner_email = "platform@company.com"

# Network
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]

# Domain
domain_name     = "dev.{DOMAIN_NAME}"
certificate_arn = "arn:aws:acm:us-east-1:{AWS_ACCOUNT_ID}:certificate/..."

# Database
db_instance_class   = "db.t3.small"
db_allocated_storage = 20

# Cache
cache_node_type = "cache.t3.micro"
cache_num_nodes = 1

# ECS API Service
api_task_cpu      = 512
api_task_memory   = 1024
api_desired_count = 1
api_min_count     = 1
api_max_count     = 2

# ECS Web UI Service
webui_task_cpu      = 256
webui_task_memory   = 512
webui_desired_count = 1
webui_min_count     = 1
webui_max_count     = 2
```

Create `environments/prod.tfvars`:

```hcl
environment = "prod"
aws_region  = "us-east-1"
owner_email = "platform@company.com"

# Network
vpc_cidr           = "10.1.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# Domain
domain_name     = "{DOMAIN_NAME}"
certificate_arn = "arn:aws:acm:us-east-1:{AWS_ACCOUNT_ID}:certificate/..."

# Database
db_instance_class   = "db.r6g.xlarge"
db_allocated_storage = 500

# Cache
cache_node_type = "cache.r6g.large"
cache_num_nodes = 3

# ECS API Service
api_task_cpu      = 2048
api_task_memory   = 4096
api_desired_count = 3
api_min_count     = 2
api_max_count     = 10

# ECS Web UI Service
webui_task_cpu      = 1024
webui_task_memory   = 2048
webui_desired_count = 3
webui_min_count     = 2
webui_max_count     = 10
```

### 15.2 Deployment Commands

```bash
# Initialize Terraform
terraform init

# Plan for dev environment
terraform plan -var-file=environments/dev.tfvars -out=tfplan-dev

# Apply dev environment
terraform apply tfplan-dev

# Plan for prod environment
terraform plan -var-file=environments/prod.tfvars -out=tfplan-prod

# Apply prod environment
terraform apply tfplan-prod
```

---

## Section 16: Cost Optimization

### 16.1 Fargate Spot Configuration

Already configured in ECS Cluster module (Section 8). Adjust weights in variables:

```hcl
# In environments/*.tfvars
fargate_weight      = 1  # Base tasks on regular Fargate
fargate_base        = 1  # Minimum 1 task on regular Fargate
fargate_spot_weight = 3  # Additional tasks prefer Spot (75% Spot, 25% regular)
```

### 16.2 Right-Sizing Recommendations

**Development Environment:**
- API: 512 CPU / 1024 MB RAM
- Web UI: 256 CPU / 512 MB RAM
- RDS: db.t3.small
- Redis: cache.t3.micro

**Production Environment:**
- API: 1024-2048 CPU / 2048-4096 MB RAM
- Web UI: 512-1024 CPU / 1024-2048 MB RAM
- RDS: db.r6g.large or db.r6g.xlarge
- Redis: cache.r6g.large with 2-3 nodes

### 16.3 S3 Lifecycle Policies

Already configured in S3 module (Section 12):
- Reports: 30 days -> IA, 90 days -> Glacier, 365 days -> Delete
- Logs: 30 days -> IA, 90 days -> Delete

### 16.4 RDS Storage Autoscaling

Already configured in RDS module (Section 5):
- `max_allocated_storage` enables automatic storage scaling
- Prevents manual intervention and over-provisioning

### 16.5 NAT Gateway Cost Optimization

For non-production environments, consider single NAT gateway:

```hcl
# In modules/vpc/main.tf, modify NAT gateway count
resource "aws_nat_gateway" "main" {
  count         = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.availability_zones)) : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  # ...
}
```

---

## Section 17: Validation Checklist

### 17.1 Pre-Deployment Checklist

- [ ] AWS account credentials configured
- [ ] Terraform state bucket and DynamoDB table created
- [ ] Domain registered and Route 53 hosted zone created
- [ ] SSL certificate requested and validated in ACM
- [ ] All placeholder values replaced in configuration files
- [ ] Secrets populated in AWS Secrets Manager
- [ ] Environment-specific tfvars files created
- [ ] VPC CIDR ranges don't overlap with existing networks

### 17.2 Post-Deployment Validation

```bash
# Verify VPC and networking
terraform output vpc_id
terraform output public_subnet_ids
terraform output private_subnet_ids

# Verify RDS endpoint
terraform output rds_endpoint

# Verify Redis endpoint
terraform output redis_endpoint

# Verify ECR repositories
terraform output api_ecr_repository_url
terraform output webui_ecr_repository_url

# Verify ALB
terraform output alb_dns_name

# Verify ECS cluster
terraform output ecs_cluster_name

# Test ALB health
curl -I http://$(terraform output -raw alb_dns_name)

# Verify DNS resolution
nslookup {DOMAIN_NAME}

# Verify HTTPS
curl -I https://{DOMAIN_NAME}
```

### 17.3 Security Validation

- [ ] All security groups follow least-privilege principle
- [ ] RDS is in private subnets only
- [ ] Redis is in private subnets only
- [ ] S3 buckets block public access
- [ ] S3 buckets have encryption enabled
- [ ] RDS has encryption enabled
- [ ] Redis has encryption in transit enabled
- [ ] VPC flow logs enabled
- [ ] CloudWatch alarms configured
- [ ] IAM roles follow least-privilege principle

### 17.4 Operational Validation

- [ ] CloudWatch Container Insights enabled
- [ ] Log groups have appropriate retention periods
- [ ] Auto-scaling policies configured
- [ ] Health checks properly configured
- [ ] Deployment circuit breaker enabled
- [ ] Backup retention configured for RDS
- [ ] Snapshot retention configured for Redis

---

## Complete Root Module Example

### Root `main.tf`

```hcl
locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "Terraform"
  })
}

#==============================================================================
# VPC and Networking
#==============================================================================

module "vpc" {
  source = "./modules/vpc"

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones

  tags = local.common_tags
}

#==============================================================================
# Security Groups
#==============================================================================

module "security_groups" {
  source = "./modules/security-groups"

  name_prefix = local.name_prefix
  vpc_id      = module.vpc.vpc_id

  tags = local.common_tags
}

#==============================================================================
# RDS PostgreSQL Database
#==============================================================================

module "rds" {
  source = "./modules/rds"

  name_prefix      = local.name_prefix
  private_subnets  = module.vpc.private_subnets
  security_groups  = [module.security_groups.rds_sg_id]
  database_name    = var.db_name
  master_username  = var.db_master_username
  instance_class   = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  multi_az         = var.environment == "prod"

  tags = local.common_tags
}

#==============================================================================
# ElastiCache Redis
#==============================================================================

module "elasticache" {
  source = "./modules/elasticache"

  name_prefix     = local.name_prefix
  private_subnets = module.vpc.private_subnets
  security_groups = [module.security_groups.redis_sg_id]
  node_type       = var.cache_node_type
  num_cache_nodes = var.cache_num_nodes

  tags = local.common_tags
}

#==============================================================================
# S3 Buckets
#==============================================================================

module "s3" {
  source = "./modules/s3"

  name_prefix = local.name_prefix

  tags = local.common_tags
}

#==============================================================================
# ECR Repositories
#==============================================================================

module "ecr" {
  source = "./modules/ecr"

  name_prefix  = local.name_prefix
  repositories = ["api", "web-ui", "worker"]

  tags = local.common_tags
}

#==============================================================================
# IAM Roles and Policies
#==============================================================================

module "iam" {
  source = "./modules/iam"

  name_prefix = local.name_prefix
  s3_bucket_arns = [
    module.s3.reports_bucket_arn,
    "${module.s3.reports_bucket_arn}/*",
    module.s3.logs_bucket_arn,
    "${module.s3.logs_bucket_arn}/*"
  ]

  tags = local.common_tags
}

#==============================================================================
# Application Load Balancer
#==============================================================================

module "alb" {
  source = "./modules/alb"

  name_prefix     = local.name_prefix
  vpc_id          = module.vpc.vpc_id
  public_subnets  = module.vpc.public_subnets
  security_groups = [module.security_groups.alb_sg_id]
  certificate_arn = var.certificate_arn

  tags = local.common_tags
}

#==============================================================================
# ECS Cluster
#==============================================================================

module "ecs_cluster" {
  source = "./modules/ecs-cluster"

  name_prefix = local.name_prefix

  tags = local.common_tags
}

#==============================================================================
# ECS API Service
#==============================================================================

module "ecs_api_service" {
  source = "./modules/ecs-service"

  cluster_id   = module.ecs_cluster.cluster_id
  cluster_name = module.ecs_cluster.cluster_name
  service_name = "api"

  container_image = "${module.ecr.repository_urls["api"]}:latest"
  container_port  = 8000
  task_cpu        = var.api_task_cpu
  task_memory     = var.api_task_memory

  private_subnets = module.vpc.private_subnets
  security_groups = [module.security_groups.ecs_sg_id]

  alb_target_group_arn = module.alb.api_target_group_arn

  desired_count = var.api_desired_count
  min_count     = var.api_min_count
  max_count     = var.api_max_count

  execution_role_arn = module.iam.ecs_execution_role_arn
  task_role_arn      = module.iam.ecs_task_role_arn

  environment = {
    ENVIRONMENT   = var.environment
    POSTGRES_HOST = module.rds.address
    POSTGRES_DB   = var.db_name
    REDIS_HOST    = module.elasticache.endpoint
    S3_BUCKET     = module.s3.reports_bucket_name
  }

  secrets = {
    POSTGRES_PASSWORD  = "${local.name_prefix}/db/password"
    GITHUB_TOKEN       = "${local.name_prefix}/github/token"
    SECRETS_MASTER_KEY = "${local.name_prefix}/secrets/master-key"
  }

  tags = local.common_tags
}

#==============================================================================
# ECS Web UI Service
#==============================================================================

module "ecs_webui_service" {
  source = "./modules/ecs-service"

  cluster_id   = module.ecs_cluster.cluster_id
  cluster_name = module.ecs_cluster.cluster_name
  service_name = "web-ui"

  container_image = "${module.ecr.repository_urls["web-ui"]}:latest"
  container_port  = 3000
  task_cpu        = var.webui_task_cpu
  task_memory     = var.webui_task_memory

  private_subnets = module.vpc.private_subnets
  security_groups = [module.security_groups.ecs_sg_id]

  alb_target_group_arn = module.alb.webui_target_group_arn

  desired_count = var.webui_desired_count
  min_count     = var.webui_min_count
  max_count     = var.webui_max_count

  execution_role_arn = module.iam.ecs_execution_role_arn
  task_role_arn      = module.iam.ecs_task_role_arn

  environment = {
    ENVIRONMENT         = var.environment
    NEXT_PUBLIC_API_URL = "https://${var.domain_name}/api"
  }

  tags = local.common_tags
}
```

### Root `variables.tf`

```hcl
variable "project_name" {
  description = "Project name"
  type        = string
  default     = "{PROJECT_NAME}"
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "{AWS_REGION}"
}

variable "owner_email" {
  description = "Owner email"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "{VPC_CIDR}"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = {AVAILABILITY_ZONES}
}

variable "domain_name" {
  description = "Domain name"
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate ARN"
  type        = string
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "{PROJECT_NAME}"
}

variable "db_master_username" {
  description = "Database master username"
  type        = string
  default     = "postgres"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage"
  type        = number
  default     = 100
}

variable "cache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "cache_num_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "api_task_cpu" {
  description = "API task CPU"
  type        = number
  default     = 1024
}

variable "api_task_memory" {
  description = "API task memory"
  type        = number
  default     = 2048
}

variable "api_desired_count" {
  description = "API desired count"
  type        = number
  default     = 2
}

variable "api_min_count" {
  description = "API min count"
  type        = number
  default     = 1
}

variable "api_max_count" {
  description = "API max count"
  type        = number
  default     = 4
}

variable "webui_task_cpu" {
  description = "Web UI task CPU"
  type        = number
  default     = 512
}

variable "webui_task_memory" {
  description = "Web UI task memory"
  type        = number
  default     = 1024
}

variable "webui_desired_count" {
  description = "Web UI desired count"
  type        = number
  default     = 2
}

variable "webui_min_count" {
  description = "Web UI min count"
  type        = number
  default     = 1
}

variable "webui_max_count" {
  description = "Web UI max count"
  type        = number
  default     = 4
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
```

### Root `outputs.tf`

```hcl
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.alb_dns_name
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.elasticache.endpoint
}

output "api_ecr_repository_url" {
  description = "API ECR repository URL"
  value       = module.ecr.repository_urls["api"]
}

output "webui_ecr_repository_url" {
  description = "Web UI ECR repository URL"
  value       = module.ecr.repository_urls["web-ui"]
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs_cluster.cluster_name
}
```

---

## Summary

This comprehensive infrastructure plan provides production-ready Terraform configuration for deploying web applications on AWS ECS Fargate with PostgreSQL, Redis, load balancing, auto-scaling, monitoring, and cost optimization. All code is parameterized with `{PLACEHOLDER}` patterns and follows the proven architecture from the AuditGH reference implementation.

**Key Features:**
- Multi-AZ high availability
- Auto-scaling based on CPU/memory
- Fargate Spot for cost optimization
- End-to-end encryption (at rest and in transit)
- Comprehensive CloudWatch monitoring
- Least-privilege security groups and IAM
- Automated backups and snapshots
- S3 lifecycle policies
- Environment promotion workflow

**Next Steps:**
1. Replace all `{PLACEHOLDER}` values with project-specific values
2. Create Terraform state backend (S3 + DynamoDB)
3. Create environment-specific `.tfvars` files
4. Initialize and plan: `terraform init && terraform plan`
5. Apply infrastructure: `terraform apply`
6. Populate secrets in AWS Secrets Manager
7. Build and push container images to ECR
8. Validate deployment with checklist (Section 17)
