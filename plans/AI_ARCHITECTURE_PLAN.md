---
plan: AI Architecture Implementation Plan
phase: 7
purpose: Comprehensive AI agent architecture with multi-provider abstraction, sub-agent orchestration, MCP integration, and skills registry
prerequisites: Phase 1 (Project Bootstrap), Phase 2 (Database Design), Phase 3 (API First)
duration: 5-8 days
reference: AuditGH production AI system (6 providers, 14+ endpoints, tool use, multi-agent patterns)
---

# Phase 7: AI Architecture Implementation Plan

> **Purpose:** Complete AI architecture specification covering multi-provider abstraction, agent frameworks (Claude Agent SDK, LangGraph, raw API), sub-agent orchestration patterns (supervisor, pipeline, swarm), Model Context Protocol (MCP) server and client integration, composable skills registry, tool definitions, prompt engineering, and production guardrails. Parameterized with `{PLACEHOLDER}` patterns for reuse across any domain.
>
> **Reference Implementation:** [AuditGH](/) — Production AI system with 6 LLM providers, 14+ AI-powered API endpoints, zero-day analysis with tool use, DOE self-annealing, and multi-agent orchestration.

---

## Parameter Reference

| Placeholder | Description | AuditGH Example |
|------------|-------------|-----------------|
| `{PROJECT_NAME}` | Project identifier | `auditgh` |
| `{AI_PRIMARY_PROVIDER}` | Primary LLM provider | `anthropic_foundry` |
| `{AI_FALLBACK_PROVIDER}` | Fallback LLM provider | `docker` (Docker AI Model Runner) |
| `{AI_PRIMARY_MODEL}` | Primary model identifier | `cogdep-aifoundry-dev-eus2-claude-sonnet-4-5` |
| `{AI_FALLBACK_MODEL}` | Fallback model identifier | `ai/qwen3` |
| `{AI_PROVIDERS}` | All supported providers | `claude, openai, gemini, ollama, docker, anthropic_foundry` |
| `{DOMAIN_ANALYSIS_TYPES}` | AI-powered analysis capabilities | `remediation, triage, component_analysis, architecture_review, zero_day` |
| `{MCP_SERVER_NAME}` | MCP server identifier | `auditgh-mcp` |
| `{MCP_SERVER_PORT}` | MCP server port | `3001` |
| `{SKILLS_REGISTRY_PATH}` | Path to skills definitions | `src/ai_agent/skills/` |
| `{MAX_COST_PER_ANALYSIS}` | Cost ceiling per AI operation | `0.50` (USD) |
| `{AGENT_TIMEOUT_SECONDS}` | Agent execution timeout | `120` |
| `{MAX_RETRIES}` | Max retries per provider call | `3` |
| `{TOOL_DEFINITIONS}` | Domain-specific tool list | `search_findings, search_dependencies, search_languages` |
| `{TENANT_ENTITY}` | Multi-tenant root entity | `Organization` |
| `{API_PORT}` | Backend API port | `8000` |

---

## Table of Contents

1. [AI Architecture Principles](#1-ai-architecture-principles)
2. [Provider Abstraction Layer](#2-provider-abstraction-layer)
3. [Agent Framework — Claude Agent SDK](#3-agent-framework--claude-agent-sdk-primary)
4. [Agent Framework — LangGraph](#4-agent-framework--langgraph-alternative)
5. [Agent Framework — Raw API](#5-agent-framework--raw-api-fallback)
6. [Sub-Agent Orchestration Patterns](#6-sub-agent-orchestration-patterns)
7. [MCP Server Implementation](#7-mcp-server-implementation)
8. [MCP Client Integration](#8-mcp-client-integration)
9. [Skills Registry System](#9-skills-registry-system)
10. [Tool Definitions & Function Calling](#10-tool-definitions--function-calling)
11. [Prompt Engineering Patterns](#11-prompt-engineering-patterns)
12. [AI Analysis Pipeline](#12-ai-analysis-pipeline)
13. [Conversation & Memory Management](#13-conversation--memory-management)
14. [Cost Tracking & Budget Management](#14-cost-tracking--budget-management)
15. [Failover & Resilience](#15-failover--resilience)
16. [Security & Safety Guardrails](#16-security--safety-guardrails)
17. [Monitoring, Logging & Observability](#17-monitoring-logging--observability)
18. [Database Models for AI](#18-database-models-for-ai)
19. [API Endpoints for AI](#19-api-endpoints-for-ai)
20. [Validation Checklist](#20-validation-checklist)

---

## 1. AI Architecture Principles

### 1.1 Core Design Tenets

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **Multi-Provider Abstraction** | Never couple to a single LLM vendor | Abstract base class with provider factory |
| **Agent-First Design** | Agents are first-class citizens, not afterthoughts | Dedicated `{PROJECT_NAME}/src/ai_agent/` module |
| **Tool Use Over Prompting** | Prefer structured tools over prompt engineering tricks | MCP tools + function calling schemas |
| **MCP for Interoperability** | Expose and consume via standard protocol | FastMCP server + MCP client integration |
| **Cost-Aware by Default** | Track every token, enforce budgets | Per-provider cost estimation, budget limits |
| **Failover Built-In** | Every AI call has a fallback path | Primary → fallback → cached → graceful error |
| **Security at Every Layer** | Sanitize inputs, validate outputs, audit everything | Guardrails, PII redaction, RBAC integration |

### 1.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  AI Chat │ Analysis Dashboard │ Remediation Viewer           │
└──────────┬──────────────────────────────────────────────────┘
           │ REST/WebSocket
┌──────────▼──────────────────────────────────────────────────┐
│                    FastAPI Backend :{API_PORT}                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  AI Router   │  │ Skills API   │  │  MCP Gateway     │  │
│  │  /ai/*       │  │ /skills/*    │  │  /mcp/*          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘  │
│         │                 │                  │               │
│  ┌──────▼─────────────────▼──────────────────▼───────────┐  │
│  │              Agent Orchestration Layer                  │  │
│  │  ┌────────────┐ ┌──────────┐ ┌────────────────────┐   │  │
│  │  │ Supervisor │ │ Pipeline │ │ Swarm (Dynamic)    │   │  │
│  │  │  Pattern   │ │ Pattern  │ │ Pattern            │   │  │
│  │  └─────┬──────┘ └────┬─────┘ └─────────┬──────────┘   │  │
│  │        └──────────────┼─────────────────┘              │  │
│  │                       ▼                                │  │
│  │  ┌────────────────────────────────────────────────┐    │  │
│  │  │           Skills Registry                       │    │  │
│  │  │  security_analysis │ remediation │ triage       │    │  │
│  │  │  architecture      │ zero_day    │ custom...    │    │  │
│  │  └────────────────────┬───────────────────────────┘    │  │
│  │                       ▼                                │  │
│  │  ┌────────────────────────────────────────────────┐    │  │
│  │  │        Provider Abstraction Layer               │    │  │
│  │  │  ┌────────┐ ┌────────┐ ┌──────┐ ┌──────────┐  │    │  │
│  │  │  │ Claude │ │ OpenAI │ │Gemini│ │  Ollama  │  │    │  │
│  │  │  │(Foundry│ │ (GPT-5)│ │(1.5) │ │ (local)  │  │    │  │
│  │  │  └────────┘ └────────┘ └──────┘ └──────────┘  │    │  │
│  │  │  ┌──────────┐ ┌────────────────────────────┐   │    │  │
│  │  │  │Docker AI │ │ FailoverProvider (chain)   │   │    │  │
│  │  │  └──────────┘ └────────────────────────────┘   │    │  │
│  │  └────────────────────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │   MCP Server         │  │   MCP Client                │  │
│  │   (expose app tools) │  │   (consume external tools)  │  │
│  └──────────────────────┘  └─────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
           │                              │
    ┌──────▼──────┐              ┌────────▼────────┐
    │ PostgreSQL  │              │  External MCP   │
    │ (AI tables) │              │  Servers        │
    └─────────────┘              └─────────────────┘
```

### 1.3 Module Structure

```
src/ai_agent/
├── __init__.py
├── agent.py                    # Main AIAgent orchestrator
├── config.py                   # AI configuration (models, costs, timeouts)
├── providers/
│   ├── __init__.py
│   ├── base.py                 # Abstract AIProvider base class
│   ├── claude.py               # Anthropic Claude (direct + Azure Foundry)
│   ├── openai.py               # OpenAI GPT models
│   ├── gemini.py               # Google Gemini
│   ├── ollama.py               # Local Ollama models
│   ├── docker.py               # Docker AI Model Runner
│   ├── anthropic_foundry.py    # Azure AI Foundry (Claude)
│   └── failover.py             # Automatic failover chain
├── orchestration/
│   ├── __init__.py
│   ├── supervisor.py           # Supervisor pattern
│   ├── pipeline.py             # Pipeline pattern
│   ├── swarm.py                # Swarm/handoff pattern
│   └── hybrid.py               # Composite patterns
├── tools/
│   ├── __init__.py
│   ├── registry.py             # Tool registry and executor
│   ├── db_tools.py             # Database search tools
│   ├── api_tools.py            # External API tools
│   └── file_tools.py           # File system tools
├── skills/
│   ├── __init__.py
│   ├── registry.py             # Skills registry
│   ├── base.py                 # Base skill class
│   └── builtin/                # Built-in skills
│       ├── analysis.py
│       ├── remediation.py
│       ├── triage.py
│       └── architecture.py
├── mcp/
│   ├── __init__.py
│   ├── server.py               # MCP server (expose app tools)
│   └── client.py               # MCP client (consume external tools)
├── prompts/
│   ├── __init__.py
│   ├── system.py               # System prompt templates
│   ├── analysis.py             # Analysis prompt templates
│   └── formatting.py           # Output formatting prompts
├── reasoning.py                # ReasoningEngine (tool use orchestration)
├── remediation.py              # RemediationEngine
├── learning.py                 # Learning system (outcome tracking)
├── diagnostics.py              # Diagnostic data collection
├── conversations.py            # Conversation manager
└── cost.py                     # Cost tracking
```

> **AuditGH Reference:** The production implementation at `src/ai_agent/` follows this structure with `agent.py` as the main orchestrator, `providers/` with 6 provider implementations, `tools/db_tools.py` for database search, and `reasoning.py` for the ReasoningEngine that coordinates tool use in zero-day analysis.

---

## 2. Provider Abstraction Layer

### 2.1 Abstract Base Provider

```python
# src/ai_agent/providers/base.py
"""Abstract base class for all AI providers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional
from enum import Enum


class ProviderType(str, Enum):
    """Supported AI provider types."""
    CLAUDE = "claude"
    OPENAI = "openai"
    GEMINI = "gemini"
    OLLAMA = "ollama"
    DOCKER = "docker"
    ANTHROPIC_FOUNDRY = "anthropic_foundry"


@dataclass
class ProviderConfig:
    """Configuration for an AI provider."""
    provider_type: ProviderType
    model: str
    api_key: str = ""
    base_url: str = ""
    max_tokens: int = 4096
    temperature: float = 0.3
    timeout: int = {AGENT_TIMEOUT_SECONDS}
    max_retries: int = {MAX_RETRIES}
    cost_per_input_token: float = 0.0
    cost_per_output_token: float = 0.0


@dataclass
class AIResponse:
    """Standardized response from any AI provider."""
    content: str
    model: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0
    tool_calls: list = field(default_factory=list)
    finish_reason: str = ""
    thinking: str = ""  # Extended thinking / chain-of-thought
    raw_response: Any = None


class AIProvider(ABC):
    """Abstract base class for AI providers.

    All providers must implement these methods to ensure
    consistent behavior across the provider abstraction layer.
    """

    def __init__(self, config: ProviderConfig):
        self.config = config
        self.total_input_tokens: int = 0
        self.total_output_tokens: int = 0
        self.total_cost: float = 0.0
        self.call_count: int = 0

    @abstractmethod
    async def generate(
        self,
        messages: list[dict],
        system: str = "",
        tools: list[dict] | None = None,
        tool_choice: str | dict = "auto",
        temperature: float | None = None,
        max_tokens: int | None = None,
        response_format: dict | None = None,
    ) -> AIResponse:
        """Generate a response from the AI model."""
        ...

    @abstractmethod
    async def generate_stream(
        self,
        messages: list[dict],
        system: str = "",
        tools: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        """Stream a response from the AI model."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the provider is available and responding."""
        ...

    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """Estimate cost for a given token count."""
        return (
            input_tokens * self.config.cost_per_input_token
            + output_tokens * self.config.cost_per_output_token
        )

    def get_total_cost(self) -> float:
        """Return cumulative cost across all calls."""
        return self.total_cost

    def get_total_tokens(self) -> dict:
        """Return cumulative token usage."""
        return {
            "input": self.total_input_tokens,
            "output": self.total_output_tokens,
            "total": self.total_input_tokens + self.total_output_tokens,
        }

    def _track_usage(self, response: AIResponse) -> None:
        """Track token usage and cost after each call."""
        self.total_input_tokens += response.input_tokens
        self.total_output_tokens += response.output_tokens
        self.total_cost += response.cost
        self.call_count += 1
```

### 2.2 Claude Provider (with DOE Self-Annealing)

```python
# src/ai_agent/providers/claude.py
"""Anthropic Claude provider with DOE self-annealing model correction."""

import json
import re
from anthropic import AsyncAnthropic
from loguru import logger
from .base import AIProvider, AIResponse, ProviderConfig


# Known valid Claude model identifiers
VALID_CLAUDE_MODELS = {
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-opus-4-5-20251101",
    "claude-opus-4-6-20260225",
}

# Azure AI Foundry deployment prefix
FOUNDRY_PREFIX = "cogdep-aifoundry-"


class DOESelfAnnealing:
    """Design of Experiments self-annealing for model name correction.

    When an API call fails due to invalid model name, this system:
    1. Extracts the suggested model from the error message
    2. Corrects the model name automatically
    3. Tracks all corrections for audit
    """

    def __init__(self):
        self.corrections: list[dict] = []

    def extract_valid_model(self, error_message: str) -> str | None:
        """Extract a valid model name from an API error response."""
        # Pattern: "model: <invalid> is not available. Available models: [...]"
        match = re.search(r"Available models?:\s*\[([^\]]+)\]", error_message)
        if match:
            models = [m.strip().strip("'\"") for m in match.group(1).split(",")]
            # Prefer sonnet > opus > haiku for cost efficiency
            for preferred in ["sonnet-4", "opus-4", "sonnet-3.5", "haiku"]:
                for model in models:
                    if preferred in model:
                        return model
            return models[0] if models else None
        return None

    def record_correction(self, original: str, corrected: str, error: str) -> None:
        """Record a model name correction for auditing."""
        self.corrections.append({
            "original": original,
            "corrected": corrected,
            "error": error,
        })
        logger.warning(
            f"DOE Self-Annealing: corrected model '{original}' → '{corrected}'"
        )


class ClaudeProvider(AIProvider):
    """Anthropic Claude provider with self-annealing and cost tracking."""

    # Cost per token (Claude Sonnet 4)
    COST_INPUT = 3.00 / 1_000_000   # $3.00 per 1M input tokens
    COST_OUTPUT = 15.00 / 1_000_000  # $15.00 per 1M output tokens

    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.client = AsyncAnthropic(
            api_key=config.api_key,
            base_url=config.base_url or None,
            timeout=config.timeout,
            max_retries=config.max_retries,
        )
        self.doe = DOESelfAnnealing()
        self.config.cost_per_input_token = self.COST_INPUT
        self.config.cost_per_output_token = self.COST_OUTPUT

    async def generate(
        self,
        messages: list[dict],
        system: str = "",
        tools: list[dict] | None = None,
        tool_choice: str | dict = "auto",
        temperature: float | None = None,
        max_tokens: int | None = None,
        response_format: dict | None = None,
    ) -> AIResponse:
        """Generate response with automatic model self-annealing."""
        kwargs = {
            "model": self.config.model,
            "messages": messages,
            "max_tokens": max_tokens or self.config.max_tokens,
            "temperature": temperature if temperature is not None else self.config.temperature,
        }
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = self._convert_tools(tools)
            kwargs["tool_choice"] = (
                {"type": tool_choice} if isinstance(tool_choice, str) else tool_choice
            )

        try:
            response = await self.client.messages.create(**kwargs)
        except Exception as e:
            # DOE Self-Annealing: auto-correct invalid model names
            error_msg = str(e)
            corrected_model = self.doe.extract_valid_model(error_msg)
            if corrected_model:
                self.doe.record_correction(self.config.model, corrected_model, error_msg)
                self.config.model = corrected_model
                kwargs["model"] = corrected_model
                response = await self.client.messages.create(**kwargs)
            else:
                raise

        # Parse response
        content = ""
        tool_calls = []
        thinking = ""
        for block in response.content:
            if block.type == "text":
                content += block.text
            elif block.type == "tool_use":
                tool_calls.append({
                    "id": block.id,
                    "name": block.name,
                    "arguments": block.input,
                })
            elif block.type == "thinking":
                thinking += block.thinking

        result = AIResponse(
            content=content,
            model=response.model,
            provider="claude",
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            cost=self.estimate_cost(response.usage.input_tokens, response.usage.output_tokens),
            tool_calls=tool_calls,
            finish_reason=response.stop_reason,
            thinking=thinking,
            raw_response=response,
        )
        self._track_usage(result)
        return result

    async def generate_stream(self, messages, system="", tools=None):
        """Stream response tokens."""
        async with self.client.messages.stream(
            model=self.config.model,
            messages=messages,
            system=system or "",
            max_tokens=self.config.max_tokens,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def health_check(self) -> bool:
        """Verify Claude API is reachable."""
        try:
            response = await self.client.messages.create(
                model=self.config.model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
            )
            return response.stop_reason is not None
        except Exception:
            return False

    def _convert_tools(self, tools: list[dict]) -> list[dict]:
        """Convert generic tool format to Anthropic tool format."""
        return [
            {
                "name": t["name"],
                "description": t.get("description", ""),
                "input_schema": t.get("parameters", t.get("input_schema", {})),
            }
            for t in tools
        ]
```

> **AuditGH Reference:** The production Claude provider at `src/ai_agent/providers/claude.py` (42KB) includes DOE self-annealing that auto-corrects model names when Azure AI Foundry deployments change, plus specialized methods for `analyze_stuck_scan()`, `generate_remediation()`, `triage_finding()`, and `analyze_component()`.

### 2.3 OpenAI Provider (with Function Calling)

```python
# src/ai_agent/providers/openai.py
"""OpenAI provider with function calling support."""

from openai import AsyncOpenAI
from .base import AIProvider, AIResponse, ProviderConfig


class OpenAIProvider(AIProvider):
    """OpenAI GPT provider with function calling."""

    COST_INPUT = 5.00 / 1_000_000   # GPT-4o pricing
    COST_OUTPUT = 15.00 / 1_000_000

    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.client = AsyncOpenAI(
            api_key=config.api_key,
            base_url=config.base_url or None,
            timeout=config.timeout,
            max_retries=config.max_retries,
        )
        self.config.cost_per_input_token = self.COST_INPUT
        self.config.cost_per_output_token = self.COST_OUTPUT

    async def generate(
        self,
        messages: list[dict],
        system: str = "",
        tools: list[dict] | None = None,
        tool_choice: str | dict = "auto",
        temperature: float | None = None,
        max_tokens: int | None = None,
        response_format: dict | None = None,
    ) -> AIResponse:
        """Generate response with OpenAI function calling."""
        # Prepend system message
        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.extend(messages)

        kwargs = {
            "model": self.config.model,
            "messages": full_messages,
            "max_tokens": max_tokens or self.config.max_tokens,
            "temperature": temperature if temperature is not None else self.config.temperature,
        }

        if tools:
            kwargs["tools"] = self._convert_tools(tools)
            kwargs["tool_choice"] = tool_choice
        if response_format:
            kwargs["response_format"] = response_format

        response = await self.client.chat.completions.create(**kwargs)
        choice = response.choices[0]

        # Parse tool calls
        tool_calls = []
        if choice.message.tool_calls:
            import json
            for tc in choice.message.tool_calls:
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": json.loads(tc.function.arguments),
                })

        result = AIResponse(
            content=choice.message.content or "",
            model=response.model,
            provider="openai",
            input_tokens=response.usage.prompt_tokens,
            output_tokens=response.usage.completion_tokens,
            total_tokens=response.usage.total_tokens,
            cost=self.estimate_cost(response.usage.prompt_tokens, response.usage.completion_tokens),
            tool_calls=tool_calls,
            finish_reason=choice.finish_reason,
            raw_response=response,
        )
        self._track_usage(result)
        return result

    async def generate_stream(self, messages, system="", tools=None):
        full_messages = [{"role": "system", "content": system}] if system else []
        full_messages.extend(messages)
        stream = await self.client.chat.completions.create(
            model=self.config.model,
            messages=full_messages,
            max_tokens=self.config.max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def health_check(self) -> bool:
        try:
            response = await self.client.chat.completions.create(
                model=self.config.model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
            )
            return response.choices[0].finish_reason is not None
        except Exception:
            return False

    def _convert_tools(self, tools: list[dict]) -> list[dict]:
        """Convert to OpenAI function calling format."""
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t.get("parameters", t.get("input_schema", {})),
                },
            }
            for t in tools
        ]
```

### 2.4 Ollama Provider (Local Models)

```python
# src/ai_agent/providers/ollama.py
"""Ollama provider for local model execution."""

import httpx
import json
from .base import AIProvider, AIResponse, ProviderConfig


class OllamaProvider(AIProvider):
    """Ollama local model provider — zero cost, air-gapped capable."""

    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.base_url = config.base_url or "http://localhost:11434"
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=config.timeout)

    async def generate(self, messages, system="", tools=None, **kwargs) -> AIResponse:
        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.extend(messages)

        payload = {
            "model": self.config.model,
            "messages": full_messages,
            "stream": False,
            "options": {"temperature": self.config.temperature},
        }
        if tools:
            payload["tools"] = self._convert_tools_ollama(tools)

        resp = await self.client.post("/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()

        tool_calls = []
        if data.get("message", {}).get("tool_calls"):
            for tc in data["message"]["tool_calls"]:
                tool_calls.append({
                    "id": f"ollama_{tc['function']['name']}",
                    "name": tc["function"]["name"],
                    "arguments": tc["function"]["arguments"],
                })

        result = AIResponse(
            content=data.get("message", {}).get("content", ""),
            model=self.config.model,
            provider="ollama",
            input_tokens=data.get("prompt_eval_count", 0),
            output_tokens=data.get("eval_count", 0),
            total_tokens=data.get("prompt_eval_count", 0) + data.get("eval_count", 0),
            cost=0.0,  # Local — no cost
            tool_calls=tool_calls,
            finish_reason="stop",
            raw_response=data,
        )
        self._track_usage(result)
        return result

    async def generate_stream(self, messages, system="", tools=None):
        full_messages = [{"role": "system", "content": system}] if system else []
        full_messages.extend(messages)
        async with self.client.stream(
            "POST", "/api/chat",
            json={"model": self.config.model, "messages": full_messages, "stream": True},
        ) as resp:
            async for line in resp.aiter_lines():
                data = json.loads(line)
                if content := data.get("message", {}).get("content"):
                    yield content

    async def health_check(self) -> bool:
        try:
            resp = await self.client.get("/api/tags")
            return resp.status_code == 200
        except Exception:
            return False

    def _convert_tools_ollama(self, tools):
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t.get("parameters", {}),
                },
            }
            for t in tools
        ]
```

### 2.5 Provider Factory

```python
# src/ai_agent/providers/__init__.py
"""Provider factory — instantiate the correct provider from environment config."""

import os
from .base import AIProvider, ProviderConfig, ProviderType
from .claude import ClaudeProvider
from .openai import OpenAIProvider
from .ollama import OllamaProvider
from .failover import FailoverProvider


PROVIDER_MAP = {
    ProviderType.CLAUDE: ClaudeProvider,
    ProviderType.ANTHROPIC_FOUNDRY: ClaudeProvider,  # Same SDK, different base_url
    ProviderType.OPENAI: OpenAIProvider,
    ProviderType.OLLAMA: OllamaProvider,
    # ProviderType.GEMINI: GeminiProvider,
    # ProviderType.DOCKER: DockerProvider,
}


def get_provider(
    provider_type: str | None = None,
    model: str | None = None,
    enable_failover: bool = True,
    failover_model: str = "{AI_FALLBACK_MODEL}",
) -> AIProvider:
    """Factory: create an AI provider from environment configuration.

    Args:
        provider_type: Override AI_PROVIDER env var
        model: Override AI_MODEL env var
        enable_failover: Wrap in FailoverProvider
        failover_model: Model for fallback provider

    Returns:
        Configured AIProvider instance
    """
    provider_type = provider_type or os.getenv("AI_PROVIDER", "{AI_PRIMARY_PROVIDER}")
    model = model or os.getenv("AI_MODEL", "{AI_PRIMARY_MODEL}")

    ptype = ProviderType(provider_type)

    config = ProviderConfig(
        provider_type=ptype,
        model=model,
        api_key=_get_api_key(ptype),
        base_url=_get_base_url(ptype),
    )

    provider_class = PROVIDER_MAP.get(ptype)
    if not provider_class:
        raise ValueError(f"Unsupported provider: {provider_type}")

    primary = provider_class(config)

    if enable_failover:
        fallback_config = ProviderConfig(
            provider_type=ProviderType.OLLAMA,
            model=failover_model,
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        )
        fallback = OllamaProvider(fallback_config)
        return FailoverProvider(primary=primary, fallback=fallback)

    return primary


def _get_api_key(ptype: ProviderType) -> str:
    """Get API key for provider from environment."""
    key_map = {
        ProviderType.CLAUDE: "ANTHROPIC_API_KEY",
        ProviderType.ANTHROPIC_FOUNDRY: "ANTHROPIC_FOUNDRY_API_KEY",
        ProviderType.OPENAI: "OPENAI_API_KEY",
        ProviderType.GEMINI: "GEMINI_API_KEY",
    }
    return os.getenv(key_map.get(ptype, ""), "")


def _get_base_url(ptype: ProviderType) -> str:
    """Get base URL for provider from environment."""
    url_map = {
        ProviderType.ANTHROPIC_FOUNDRY: "ANTHROPIC_FOUNDRY_BASE_URL",
        ProviderType.OLLAMA: "OLLAMA_BASE_URL",
        ProviderType.DOCKER: "DOCKER_BASE_URL",
    }
    return os.getenv(url_map.get(ptype, ""), "")
```

### 2.6 Failover Provider

```python
# src/ai_agent/providers/failover.py
"""Automatic failover between primary and fallback providers."""

from loguru import logger
from .base import AIProvider, AIResponse


class FailoverProvider(AIProvider):
    """Wraps a primary + fallback provider with automatic failover.

    If the primary provider fails, transparently retries with fallback.
    Tracks which provider served each request for cost/audit purposes.
    """

    def __init__(self, primary: AIProvider, fallback: AIProvider):
        # Don't call super().__init__ — we delegate to children
        self.primary = primary
        self.fallback = fallback
        self.failover_count: int = 0

    async def generate(self, messages, system="", tools=None, **kwargs) -> AIResponse:
        try:
            return await self.primary.generate(messages, system, tools, **kwargs)
        except Exception as e:
            logger.warning(
                f"Primary provider failed ({self.primary.config.provider_type}): {e}. "
                f"Failing over to {self.fallback.config.provider_type}"
            )
            self.failover_count += 1
            return await self.fallback.generate(messages, system, tools, **kwargs)

    async def generate_stream(self, messages, system="", tools=None):
        try:
            async for chunk in self.primary.generate_stream(messages, system, tools):
                yield chunk
        except Exception as e:
            logger.warning(f"Primary stream failed, failing over: {e}")
            self.failover_count += 1
            async for chunk in self.fallback.generate_stream(messages, system, tools):
                yield chunk

    async def health_check(self) -> bool:
        primary_ok = await self.primary.health_check()
        fallback_ok = await self.fallback.health_check()
        return primary_ok or fallback_ok

    def estimate_cost(self, input_tokens, output_tokens):
        return self.primary.estimate_cost(input_tokens, output_tokens)

    def get_total_cost(self):
        return self.primary.get_total_cost() + self.fallback.get_total_cost()
```

> **AuditGH Reference:** Production uses `FailoverProvider` with Docker AI (`ai/qwen3`) as the automatic fallback when Azure AI Foundry is unavailable. The failover is transparent to calling code — the same `generate()` API works regardless of which provider serves the request.

---

## 3. Agent Framework — Claude Agent SDK (Primary)

### 3.1 Installation

```bash
pip install claude-agent-sdk
# Requires Python 3.10+, includes Claude Code runtime
```

### 3.2 Basic Agent Definition

```python
# src/ai_agent/frameworks/claude_sdk.py
"""Claude Agent SDK integration for {PROJECT_NAME}."""

import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions


async def run_analysis_agent(
    prompt: str,
    system_prompt: str = "",
    model: str = "sonnet",
) -> str:
    """Run a single-shot analysis agent using Claude Agent SDK.

    Args:
        prompt: User query / analysis request
        system_prompt: System instructions for the agent
        model: Claude model tier (sonnet, opus, haiku)

    Returns:
        Agent's text response
    """
    options = ClaudeAgentOptions(
        model=model,
        system_prompt=system_prompt or (
            "You are an expert {DOMAIN_ANALYSIS_TYPES} analyst for {PROJECT_NAME}. "
            "Analyze data thoroughly, cite specific evidence, and provide actionable recommendations."
        ),
    )

    result_text = ""
    async for message in query(prompt=prompt, options=options):
        if hasattr(message, "content"):
            result_text += message.content

    return result_text
```

### 3.3 Agent with Custom Tools (MCP)

```python
# src/ai_agent/frameworks/claude_sdk_tools.py
"""Claude Agent SDK with custom MCP tools."""

from claude_agent_sdk import query, ClaudeAgentOptions, MCPServerConfig


async def run_agent_with_tools(prompt: str, db_session=None) -> str:
    """Run agent with access to {PROJECT_NAME} database tools via MCP.

    The Claude Agent SDK natively supports MCP servers, allowing agents
    to discover and invoke tools without manual wiring.
    """
    options = ClaudeAgentOptions(
        model="sonnet",
        system_prompt=(
            "You are a {DOMAIN_ANALYSIS_TYPES} agent for {PROJECT_NAME}. "
            "Use the available tools to search data and provide evidence-based analysis."
        ),
        # Connect to our app's MCP server for domain tools
        mcp_servers=[
            MCPServerConfig(
                name="{MCP_SERVER_NAME}",
                transport="streamable-http",
                url="http://localhost:{MCP_SERVER_PORT}/mcp",
            ),
        ],
        # Permission model
        allowed_tools=[
            "search_findings",
            "search_dependencies",
            "analyze_component",
            "get_repository_details",
        ],
    )

    result = ""
    async for message in query(prompt=prompt, options=options):
        if hasattr(message, "content"):
            result += message.content
    return result
```

### 3.4 Sub-Agent Orchestration with Claude SDK

```python
# src/ai_agent/frameworks/claude_sdk_subagents.py
"""Multi-agent orchestration using Claude Agent SDK sub-agents."""

from claude_agent_sdk import query, ClaudeAgentOptions, SubAgentConfig


# Define specialized sub-agents
TRIAGE_AGENT = SubAgentConfig(
    name="triage_expert",
    model="haiku",  # Fast, cheap for classification
    system_prompt=(
        "You are a security finding triage expert. "
        "Classify findings by severity, determine false positive probability, "
        "and recommend priority. Return JSON with: priority, confidence, reasoning."
    ),
)

REMEDIATION_AGENT = SubAgentConfig(
    name="remediation_expert",
    model="sonnet",  # Needs code generation quality
    system_prompt=(
        "You are a secure coding expert. Generate specific, tested remediation code "
        "for security vulnerabilities. Include the fix as a unified diff."
    ),
)

ARCHITECTURE_AGENT = SubAgentConfig(
    name="architecture_reviewer",
    model="opus",  # Needs deep reasoning
    system_prompt=(
        "You are a software architecture expert. Analyze repository structure, "
        "identify design patterns, assess security posture, and provide "
        "comprehensive architecture review."
    ),
)


async def run_supervisor_agent(query_text: str) -> str:
    """Supervisor agent that delegates to specialized sub-agents."""
    options = ClaudeAgentOptions(
        model="sonnet",
        system_prompt=(
            "You are the lead {PROJECT_NAME} analyst. Delegate tasks to your team:\n"
            "- triage_expert: For classifying and prioritizing findings\n"
            "- remediation_expert: For generating fix code\n"
            "- architecture_reviewer: For design and structure analysis\n\n"
            "Synthesize their outputs into a unified report."
        ),
        subagents=[TRIAGE_AGENT, REMEDIATION_AGENT, ARCHITECTURE_AGENT],
    )

    result = ""
    async for message in query(prompt=query_text, options=options):
        if hasattr(message, "content"):
            result += message.content
    return result
```

---

## 4. Agent Framework — LangGraph (Alternative)

### 4.1 Installation

```bash
pip install langgraph langchain-anthropic langchain-openai langgraph-supervisor
```

### 4.2 React Agent Pattern

```python
# src/ai_agent/frameworks/langgraph_agent.py
"""LangGraph agent implementation for {PROJECT_NAME}."""

from typing import TypedDict, Annotated
from langgraph.prebuilt import create_react_agent
from langgraph.graph import StateGraph, MessagesState
from langchain_anthropic import ChatAnthropic
from langchain_core.tools import tool


@tool
def search_findings(query: str, severity: str = "") -> str:
    """Search {PROJECT_NAME} findings by keyword and optional severity filter.

    Args:
        query: Search term to match against finding titles and descriptions
        severity: Optional severity filter (critical, high, medium, low)
    """
    # Implementation connects to database
    from src.ai_agent.tools.db_tools import search_findings as _search
    from src.api.database import SessionLocal

    db = SessionLocal()
    try:
        results = _search(db, query, severity_filter=severity or None)
        return str(results[:10])  # Limit context
    finally:
        db.close()


@tool
def search_dependencies(package_name: str) -> str:
    """Search for a package/dependency across all repositories.

    Args:
        package_name: Name of the package to search for
    """
    from src.ai_agent.tools.db_tools import search_dependencies as _search
    from src.api.database import SessionLocal

    db = SessionLocal()
    try:
        results = _search(db, package_name)
        return str(results[:10])
    finally:
        db.close()


def create_analysis_agent():
    """Create a LangGraph React agent for {PROJECT_NAME} analysis."""
    model = ChatAnthropic(model="{AI_PRIMARY_MODEL}")
    return create_react_agent(
        model=model,
        tools=[search_findings, search_dependencies],
        name="{PROJECT_NAME}_analyst",
        prompt=(
            "You are an expert {DOMAIN_ANALYSIS_TYPES} analyst. "
            "Use the available tools to search for evidence before answering."
        ),
    )
```

### 4.3 Multi-Agent Supervisor

```python
# src/ai_agent/frameworks/langgraph_supervisor.py
"""LangGraph multi-agent supervisor for {PROJECT_NAME}."""

from langgraph_supervisor import create_supervisor
from langgraph.prebuilt import create_react_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.tools import tool


# Specialized tools for each agent
@tool
def triage_finding(finding_id: str) -> str:
    """Triage a specific finding by ID — classify priority and false positive probability."""
    ...

@tool
def generate_remediation(vuln_type: str, language: str, context: str) -> str:
    """Generate remediation code for a vulnerability."""
    ...

@tool
def analyze_architecture(repo_name: str) -> str:
    """Analyze repository architecture and security posture."""
    ...


def create_supervisor_workflow():
    """Create a LangGraph supervisor with specialized worker agents."""
    model = ChatAnthropic(model="{AI_PRIMARY_MODEL}")

    triage_agent = create_react_agent(
        model=ChatAnthropic(model="claude-haiku-4-5-20251001"),
        tools=[triage_finding, search_findings],
        name="triage_expert",
    )

    remediation_agent = create_react_agent(
        model=model,
        tools=[generate_remediation],
        name="remediation_expert",
    )

    architecture_agent = create_react_agent(
        model=model,
        tools=[analyze_architecture],
        name="architecture_reviewer",
    )

    supervisor = create_supervisor(
        agents=[triage_agent, remediation_agent, architecture_agent],
        model=model,
        prompt=(
            "You are the lead analyst for {PROJECT_NAME}. "
            "Route tasks to the appropriate specialist agent. "
            "Synthesize their outputs into a unified response."
        ),
    )

    return supervisor.compile()
```

---

## 5. Agent Framework — Raw API (Fallback)

### 5.1 Anthropic Raw API Agent Loop

```python
# src/ai_agent/frameworks/raw_api.py
"""Framework-free agent loop using raw Anthropic/OpenAI APIs.

Use this when you want zero framework dependencies — just the AI provider SDK.
"""

import json
from anthropic import AsyncAnthropic
from loguru import logger


TOOL_DEFINITIONS = [
    {
        "name": "search_findings",
        "description": "Search {PROJECT_NAME} findings by keyword and severity",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term"},
                "severity": {
                    "type": "string",
                    "enum": ["critical", "high", "medium", "low"],
                    "description": "Optional severity filter",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_dependencies",
        "description": "Search for a package across all repositories",
        "input_schema": {
            "type": "object",
            "properties": {
                "package_name": {"type": "string", "description": "Package name"},
            },
            "required": ["package_name"],
        },
    },
]


async def execute_tool(tool_name: str, arguments: dict) -> str:
    """Execute a tool and return its result as a string."""
    from src.ai_agent.tools.db_tools import search_findings, search_dependencies
    from src.api.database import SessionLocal

    db = SessionLocal()
    try:
        if tool_name == "search_findings":
            results = search_findings(db, arguments["query"], arguments.get("severity"))
            return json.dumps(results[:10], default=str)
        elif tool_name == "search_dependencies":
            results = search_dependencies(db, arguments["package_name"])
            return json.dumps(results[:10], default=str)
        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
    finally:
        db.close()


async def raw_agent_loop(
    user_prompt: str,
    system_prompt: str = "",
    max_iterations: int = 10,
) -> str:
    """Run a raw API agent loop with tool use.

    This is the most fundamental pattern — no frameworks, no abstractions.
    The agent generates tool calls, we execute them, feed results back,
    and repeat until the agent produces a final text response.
    """
    client = AsyncAnthropic()
    messages = [{"role": "user", "content": user_prompt}]

    for iteration in range(max_iterations):
        response = await client.messages.create(
            model="{AI_PRIMARY_MODEL}",
            system=system_prompt or "You are an expert analyst for {PROJECT_NAME}.",
            messages=messages,
            tools=TOOL_DEFINITIONS,
            max_tokens=4096,
        )

        # Check if the model wants to use tools
        if response.stop_reason == "tool_use":
            # Collect all tool use blocks
            assistant_content = response.content
            messages.append({"role": "assistant", "content": assistant_content})

            # Execute each tool call and build tool results
            tool_results = []
            for block in assistant_content:
                if block.type == "tool_use":
                    logger.info(f"Agent calling tool: {block.name}({block.input})")
                    result = await execute_tool(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

            messages.append({"role": "user", "content": tool_results})
            continue

        # Model produced a final text response — extract and return
        final_text = ""
        for block in response.content:
            if block.type == "text":
                final_text += block.text
        return final_text

    return "Agent reached maximum iterations without producing a final response."
```

> **AuditGH Reference:** The zero-day analysis in `src/ai_agent/reasoning.py` uses this exact pattern — a planning prompt generates tool calls, the system executes `search_dependencies`, `search_findings`, `search_languages`, and `search_repositories_by_technology`, then feeds results back for synthesis.

---
