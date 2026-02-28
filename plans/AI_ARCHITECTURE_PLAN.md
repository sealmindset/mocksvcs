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

## 6. Sub-Agent Orchestration Patterns

### 6.1 Pattern Selection Guide

| Pattern | Best For | Complexity | AuditGH Example |
|---------|----------|------------|-----------------|
| **Supervisor** | Parallel analysis, result aggregation | Medium | Scan orchestrator delegates to scanner, analyzer, triager |
| **Pipeline** | Sequential processing, context enrichment | Low | Scan → Deduplicate → Triage → Remediate → Report |
| **Swarm** | Dynamic routing, conversational handoffs | High | User query routes to SecurityExpert, CodeAnalyst, InfraAdvisor |
| **Hybrid** | Complex workflows combining patterns | High | Supervisor spawns pipeline sub-agents |

### 6.2 Supervisor Pattern

```python
# src/ai_agent/orchestration/supervisor.py
"""Supervisor pattern: central orchestrator delegates to specialist agents."""

import asyncio
from dataclasses import dataclass, field
from typing import Callable, Awaitable
from loguru import logger
from src.ai_agent.providers.base import AIProvider, AIResponse


@dataclass
class WorkerAgent:
    """A specialist agent that the supervisor can delegate to."""
    name: str
    description: str
    system_prompt: str
    provider: AIProvider
    tools: list[dict] = field(default_factory=list)
    max_tokens: int = 4096


@dataclass
class TaskResult:
    """Result from a worker agent."""
    worker_name: str
    content: str
    tokens_used: int
    cost: float
    success: bool
    error: str = ""


class SupervisorAgent:
    """Orchestrates multiple specialist workers to complete complex tasks.

    Workflow:
    1. Decompose user request into sub-tasks
    2. Assign sub-tasks to appropriate workers (in parallel where possible)
    3. Collect and validate worker results
    4. Synthesize into unified response
    """

    def __init__(
        self,
        provider: AIProvider,
        workers: list[WorkerAgent],
        system_prompt: str = "",
    ):
        self.provider = provider
        self.workers = {w.name: w for w in workers}
        self.system_prompt = system_prompt or self._default_system_prompt()

    def _default_system_prompt(self) -> str:
        worker_descriptions = "\n".join(
            f"- **{w.name}**: {w.description}" for w in self.workers.values()
        )
        return (
            f"You are the lead analyst for {{PROJECT_NAME}}. "
            f"You have the following specialist agents:\n{worker_descriptions}\n\n"
            "Decompose the user's request into sub-tasks. "
            "Return a JSON array of tasks: "
            '[{"worker": "name", "task": "description"}, ...]'
        )

    async def execute(self, user_query: str) -> str:
        """Execute the full supervisor workflow."""
        # Step 1: Plan — decompose into sub-tasks
        plan = await self._plan(user_query)

        # Step 2: Delegate — run workers in parallel
        results = await self._delegate(plan)

        # Step 3: Synthesize — combine worker outputs
        return await self._synthesize(user_query, results)

    async def _plan(self, query: str) -> list[dict]:
        """Ask the supervisor to decompose the query into sub-tasks."""
        import json
        response = await self.provider.generate(
            messages=[{"role": "user", "content": query}],
            system=self.system_prompt,
            response_format={"type": "json_object"},
        )
        try:
            return json.loads(response.content)
        except json.JSONDecodeError:
            # Fallback: send to all workers
            return [
                {"worker": name, "task": query}
                for name in self.workers
            ]

    async def _delegate(self, plan: list[dict]) -> list[TaskResult]:
        """Run worker agents in parallel."""
        tasks = []
        for assignment in plan:
            worker_name = assignment.get("worker", "")
            task_desc = assignment.get("task", "")
            if worker_name in self.workers:
                tasks.append(self._run_worker(self.workers[worker_name], task_desc))

        return await asyncio.gather(*tasks, return_exceptions=False)

    async def _run_worker(self, worker: WorkerAgent, task: str) -> TaskResult:
        """Execute a single worker agent."""
        try:
            response = await worker.provider.generate(
                messages=[{"role": "user", "content": task}],
                system=worker.system_prompt,
                tools=worker.tools,
            )
            return TaskResult(
                worker_name=worker.name,
                content=response.content,
                tokens_used=response.total_tokens,
                cost=response.cost,
                success=True,
            )
        except Exception as e:
            logger.error(f"Worker {worker.name} failed: {e}")
            return TaskResult(
                worker_name=worker.name, content="", tokens_used=0,
                cost=0, success=False, error=str(e),
            )

    async def _synthesize(self, original_query: str, results: list[TaskResult]) -> str:
        """Combine worker results into a unified response."""
        context = "\n\n".join(
            f"## {r.worker_name}\n{r.content}" if r.success
            else f"## {r.worker_name}\n[FAILED: {r.error}]"
            for r in results
        )
        response = await self.provider.generate(
            messages=[{"role": "user", "content": (
                f"Original question: {original_query}\n\n"
                f"Worker results:\n{context}\n\n"
                "Synthesize these into a unified, coherent response."
            )}],
            system="You are a senior analyst synthesizing specialist reports.",
        )
        return response.content
```

### 6.3 Pipeline Pattern

```python
# src/ai_agent/orchestration/pipeline.py
"""Pipeline pattern: sequential stage-based processing with context enrichment."""

from dataclasses import dataclass, field
from typing import Any
from loguru import logger
from src.ai_agent.providers.base import AIProvider


@dataclass
class PipelineContext:
    """Accumulated context passed through pipeline stages."""
    original_input: str
    stage_outputs: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    total_tokens: int = 0
    total_cost: float = 0.0

    def get_latest(self) -> str:
        """Get the most recent stage output."""
        if self.stage_outputs:
            last_key = list(self.stage_outputs.keys())[-1]
            return str(self.stage_outputs[last_key])
        return self.original_input


@dataclass
class PipelineStage:
    """A single processing stage in the pipeline."""
    name: str
    system_prompt: str
    provider: AIProvider
    tools: list[dict] = field(default_factory=list)
    output_key: str = ""  # Key in context.stage_outputs

    def __post_init__(self):
        if not self.output_key:
            self.output_key = self.name


class PipelineAgent:
    """Sequential pipeline: each stage enriches context for the next.

    Example pipeline for {PROJECT_NAME}:
        Scan → Deduplicate → Triage → Remediate → Report
    """

    def __init__(self, stages: list[PipelineStage]):
        self.stages = stages

    async def execute(self, input_text: str) -> PipelineContext:
        """Run the full pipeline sequentially."""
        context = PipelineContext(original_input=input_text)

        for i, stage in enumerate(self.stages):
            logger.info(f"Pipeline stage {i + 1}/{len(self.stages)}: {stage.name}")

            # Build prompt with accumulated context
            prompt = self._build_stage_prompt(stage, context)

            try:
                response = await stage.provider.generate(
                    messages=[{"role": "user", "content": prompt}],
                    system=stage.system_prompt,
                    tools=stage.tools,
                )
                context.stage_outputs[stage.output_key] = response.content
                context.total_tokens += response.total_tokens
                context.total_cost += response.cost

            except Exception as e:
                logger.error(f"Pipeline stage {stage.name} failed: {e}")
                context.stage_outputs[stage.output_key] = f"[STAGE FAILED: {e}]"
                # Continue pipeline — later stages can work with partial context

        return context

    def _build_stage_prompt(self, stage: PipelineStage, context: PipelineContext) -> str:
        """Build a prompt that includes relevant previous stage outputs."""
        parts = [f"Original input: {context.original_input}"]
        for key, value in context.stage_outputs.items():
            parts.append(f"\n## Previous stage ({key}):\n{value}")
        parts.append(f"\n## Your task ({stage.name}):\nProcess the above and produce your output.")
        return "\n".join(parts)


# Example: {PROJECT_NAME} finding analysis pipeline
def create_finding_pipeline(provider: AIProvider) -> PipelineAgent:
    """Create a finding analysis pipeline.

    Stages:
    1. Classify — Determine finding type and severity
    2. Deduplicate — Check for duplicate/related findings
    3. Triage — Assign priority and false positive probability
    4. Remediate — Generate fix code
    5. Report — Format final report
    """
    return PipelineAgent(stages=[
        PipelineStage(
            name="classify",
            system_prompt="Classify this security finding. Return: type, severity, category.",
            provider=provider,
        ),
        PipelineStage(
            name="triage",
            system_prompt="Given the classification, determine priority (P0-P4) and false positive probability (0-1).",
            provider=provider,
        ),
        PipelineStage(
            name="remediate",
            system_prompt="Generate specific remediation code as a unified diff. Include explanation.",
            provider=provider,
        ),
        PipelineStage(
            name="report",
            system_prompt="Format a final report in markdown with: summary, severity, remediation, and references.",
            provider=provider,
        ),
    ])
```

### 6.4 Swarm Pattern (Dynamic Handoffs)

```python
# src/ai_agent/orchestration/swarm.py
"""Swarm pattern: agents dynamically hand off based on context."""

from dataclasses import dataclass, field
from typing import Callable
from loguru import logger
from src.ai_agent.providers.base import AIProvider, AIResponse


@dataclass
class SwarmAgent:
    """An agent in the swarm that can hand off to other agents."""
    name: str
    instructions: str
    provider: AIProvider
    tools: list[dict] = field(default_factory=list)
    handoff_targets: list[str] = field(default_factory=list)


class SwarmOrchestrator:
    """Dynamic agent routing based on conversation context.

    Inspired by OpenAI Swarm — agents hand off by returning a
    transfer function that specifies the next agent.

    The swarm maintains a shared conversation history so each
    agent has full context of prior interactions.
    """

    def __init__(self, agents: list[SwarmAgent], initial_agent: str):
        self.agents = {a.name: a for a in agents}
        self.initial_agent = initial_agent
        self.conversation_history: list[dict] = []
        self.max_handoffs: int = 5

    async def run(self, user_message: str) -> str:
        """Run the swarm, allowing agents to hand off dynamically."""
        self.conversation_history.append({"role": "user", "content": user_message})
        current_agent_name = self.initial_agent
        handoff_count = 0

        while handoff_count < self.max_handoffs:
            agent = self.agents[current_agent_name]
            logger.info(f"Swarm: active agent = {agent.name}")

            # Build tools including handoff functions
            tools = list(agent.tools)
            for target in agent.handoff_targets:
                tools.append({
                    "name": f"transfer_to_{target}",
                    "description": f"Hand off conversation to {target} agent",
                    "parameters": {"type": "object", "properties": {}},
                })

            response = await agent.provider.generate(
                messages=self.conversation_history,
                system=agent.instructions,
                tools=tools if tools else None,
            )

            # Check for handoff
            handoff_target = None
            for tc in response.tool_calls:
                if tc["name"].startswith("transfer_to_"):
                    handoff_target = tc["name"].replace("transfer_to_", "")
                    break

            if handoff_target and handoff_target in self.agents:
                logger.info(f"Swarm handoff: {agent.name} → {handoff_target}")
                self.conversation_history.append({
                    "role": "assistant",
                    "content": f"[Transferring to {handoff_target}]",
                })
                current_agent_name = handoff_target
                handoff_count += 1
                continue

            # No handoff — agent produced final response
            self.conversation_history.append({
                "role": "assistant", "content": response.content,
            })
            return response.content

        return "Maximum handoffs reached. Last agent could not produce a final response."


# Example: {PROJECT_NAME} interactive assistant swarm
def create_assistant_swarm(provider: AIProvider) -> SwarmOrchestrator:
    """Create an interactive assistant with dynamic routing."""
    return SwarmOrchestrator(
        agents=[
            SwarmAgent(
                name="router",
                instructions=(
                    "You are the {PROJECT_NAME} assistant router. "
                    "Determine what the user needs and hand off to the appropriate specialist:\n"
                    "- security_expert: vulnerability questions, finding analysis\n"
                    "- code_analyst: code review, remediation, best practices\n"
                    "- infra_advisor: deployment, infrastructure, configuration\n"
                    "If unsure, ask the user to clarify."
                ),
                provider=provider,
                handoff_targets=["security_expert", "code_analyst", "infra_advisor"],
            ),
            SwarmAgent(
                name="security_expert",
                instructions=(
                    "You are a security vulnerability expert. "
                    "Analyze findings, assess risk, recommend mitigations. "
                    "If the user asks about code fixes, hand off to code_analyst."
                ),
                provider=provider,
                handoff_targets=["code_analyst", "router"],
            ),
            SwarmAgent(
                name="code_analyst",
                instructions=(
                    "You are a secure coding expert. "
                    "Generate remediation code, review patches, suggest best practices. "
                    "If the user asks about infrastructure, hand off to infra_advisor."
                ),
                provider=provider,
                handoff_targets=["infra_advisor", "router"],
            ),
            SwarmAgent(
                name="infra_advisor",
                instructions=(
                    "You are an infrastructure and DevOps expert. "
                    "Advise on deployment, container security, CI/CD, cloud configuration."
                ),
                provider=provider,
                handoff_targets=["security_expert", "router"],
            ),
        ],
        initial_agent="router",
    )
```

> **AuditGH Reference:** While AuditGH uses a centralized `AIAgent` class rather than explicit swarm handoffs, the `reasoning.py` ReasoningEngine implements a similar dynamic pattern where the AI decides which tools to invoke based on the query context, effectively routing between search_dependencies, search_findings, and search_languages "agents."

---

## 7. MCP Server Implementation

### 7.1 Installation

```bash
pip install fastmcp  # v3.0+ (includes auth, versioning, OpenTelemetry)
```

### 7.2 Core MCP Server

```python
# src/ai_agent/mcp/server.py
"""MCP Server: expose {PROJECT_NAME} data and actions as tools for external AI agents."""

from fastmcp import FastMCP
from typing import Optional
from loguru import logger

# Initialize MCP server
mcp = FastMCP(
    "{MCP_SERVER_NAME}",
    description="{PROJECT_NAME} — AI-accessible security analysis tools",
    version="1.0.0",
)


# ============================================================
# Tools — Executable actions
# ============================================================

@mcp.tool()
def search_findings(
    query: str,
    severity: str = "",
    finding_type: str = "",
    organization_id: str = "",
    limit: int = 20,
) -> list[dict]:
    """Search security findings by keyword, severity, and type.

    Args:
        query: Search term to match against titles and descriptions
        severity: Filter by severity (critical, high, medium, low)
        finding_type: Filter by type (secret, vulnerability, sast, iac)
        organization_id: Scope to a specific {TENANT_ENTITY}
        limit: Maximum results to return (default 20)

    Returns:
        List of matching findings with id, title, severity, repository, and scanner
    """
    from src.ai_agent.tools.db_tools import search_findings as _search
    from src.api.database import SessionLocal

    db = SessionLocal()
    try:
        results = _search(
            db, query,
            severity_filter=severity or None,
            finding_types=[finding_type] if finding_type else None,
            organization_id=organization_id or None,
        )
        return results[:limit]
    finally:
        db.close()


@mcp.tool()
def search_dependencies(
    package_name: str,
    version: str = "",
    organization_id: str = "",
) -> list[dict]:
    """Search for a software package/dependency across all repositories.

    Args:
        package_name: Package name (e.g., 'lodash', 'requests', 'spring-core')
        version: Optional version constraint
        organization_id: Scope to a specific {TENANT_ENTITY}

    Returns:
        List of repositories using this dependency with version info
    """
    from src.ai_agent.tools.db_tools import search_dependencies as _search
    from src.api.database import SessionLocal

    db = SessionLocal()
    try:
        return _search(
            db, package_name,
            version_spec=version or None,
            organization_id=organization_id or None,
        )
    finally:
        db.close()


@mcp.tool()
def analyze_component(
    package_name: str,
    version: str,
    package_manager: str = "npm",
) -> dict:
    """Run AI-powered vulnerability analysis on a software component.

    Args:
        package_name: Component/package name
        version: Component version
        package_manager: Package manager (npm, pip, maven, go)

    Returns:
        Analysis with vulnerability_summary, severity, exploitability, fixed_version
    """
    # Delegates to AI provider for analysis
    import asyncio
    from src.ai_agent.providers import get_provider

    provider = get_provider()
    loop = asyncio.get_event_loop()
    # Sync wrapper for MCP tool (MCP tools are sync by default)
    result = loop.run_until_complete(
        provider.generate(
            messages=[{"role": "user", "content": (
                f"Analyze this component for vulnerabilities:\n"
                f"Package: {package_name}\nVersion: {version}\nManager: {package_manager}"
            )}],
            system="You are a security researcher. Return JSON with: vulnerability_summary, severity, exploitability, fixed_version.",
        )
    )
    import json
    try:
        return json.loads(result.content)
    except json.JSONDecodeError:
        return {"analysis": result.content}


@mcp.tool()
def get_repository_summary(repo_name: str) -> dict:
    """Get a summary of a repository including finding counts and risk score.

    Args:
        repo_name: Repository name (e.g., 'org/repo-name')

    Returns:
        Summary with finding_counts, risk_score, last_scan_date, technologies
    """
    from src.api.database import SessionLocal
    from src.api.models import Repository, Finding
    from sqlalchemy import func

    db = SessionLocal()
    try:
        repo = db.query(Repository).filter(Repository.full_name == repo_name).first()
        if not repo:
            return {"error": f"Repository {repo_name} not found"}

        findings = db.query(
            Finding.severity, func.count(Finding.id)
        ).filter(Finding.repository_id == repo.id).group_by(Finding.severity).all()

        return {
            "name": repo.full_name,
            "risk_score": repo.risk_score,
            "last_scan": str(repo.last_scan_at),
            "finding_counts": {sev: count for sev, count in findings},
        }
    finally:
        db.close()


# ============================================================
# Resources — Read-only data access
# ============================================================

@mcp.resource("finding://{finding_id}")
def get_finding(finding_id: str) -> str:
    """Get detailed information about a specific finding."""
    from src.api.database import SessionLocal
    from src.api.models import Finding
    import json

    db = SessionLocal()
    try:
        finding = db.query(Finding).filter(Finding.id == finding_id).first()
        if not finding:
            return f"Finding {finding_id} not found"
        return json.dumps({
            "id": str(finding.id),
            "title": finding.title,
            "severity": finding.severity,
            "description": finding.description,
            "scanner": finding.scanner,
            "file_path": finding.file_path,
            "remediation": finding.ai_remediation_text,
        }, default=str)
    finally:
        db.close()


@mcp.resource("repository://{repo_name}")
def get_repository(repo_name: str) -> str:
    """Get detailed information about a repository."""
    from src.api.database import SessionLocal
    from src.api.models import Repository
    import json

    db = SessionLocal()
    try:
        repo = db.query(Repository).filter(Repository.full_name == repo_name).first()
        if not repo:
            return f"Repository {repo_name} not found"
        return json.dumps({
            "name": repo.full_name,
            "primary_language": repo.primary_language,
            "risk_score": repo.risk_score,
            "is_archived": repo.is_archived,
        }, default=str)
    finally:
        db.close()


# ============================================================
# Prompts — Reusable analysis templates
# ============================================================

@mcp.prompt()
def triage_prompt(finding_title: str, severity: str, scanner: str) -> str:
    """Generate a triage analysis prompt for a security finding.

    Args:
        finding_title: Title of the finding
        severity: Reported severity
        scanner: Scanner that detected it
    """
    return (
        f"Triage the following security finding:\n\n"
        f"**Title:** {finding_title}\n"
        f"**Severity:** {severity}\n"
        f"**Scanner:** {scanner}\n\n"
        "Determine:\n"
        "1. Priority (P0-P4)\n"
        "2. False positive probability (0.0-1.0)\n"
        "3. Recommended action (fix, accept risk, investigate)\n"
        "4. Reasoning for your assessment"
    )


@mcp.prompt()
def remediation_prompt(vuln_type: str, language: str, context: str = "") -> str:
    """Generate a remediation code generation prompt.

    Args:
        vuln_type: Type of vulnerability (XSS, SQL injection, etc.)
        language: Programming language of the affected code
        context: Optional code context around the vulnerability
    """
    return (
        f"Generate remediation code for this vulnerability:\n\n"
        f"**Type:** {vuln_type}\n"
        f"**Language:** {language}\n"
        f"**Context:**\n```\n{context}\n```\n\n"
        "Provide:\n"
        "1. Explanation of the vulnerability\n"
        "2. Fixed code as a unified diff\n"
        "3. Testing suggestions to verify the fix"
    )


# ============================================================
# Server runner
# ============================================================

def run_mcp_server(transport: str = "streamable-http", port: int = {MCP_SERVER_PORT}):
    """Start the MCP server.

    Args:
        transport: 'streamable-http' for network, 'stdio' for local process
        port: Server port (only for HTTP transport)
    """
    if transport == "stdio":
        mcp.run(transport="stdio")
    else:
        mcp.run(transport="streamable-http", host="0.0.0.0", port=port)


if __name__ == "__main__":
    run_mcp_server()
```

> **AuditGH Reference:** AuditGH currently uses custom tool definitions in `src/ai_agent/tools/db_tools.py` rather than MCP. This plan adds MCP as a standardized layer on top of those same tools, enabling external AI agents (Claude Code, Cursor, VS Code Copilot) to interact with the application natively.

---

## 8. MCP Client Integration

### 8.1 Consuming External MCP Servers

```python
# src/ai_agent/mcp/client.py
"""MCP Client: connect to external MCP servers and use their tools."""

import asyncio
from dataclasses import dataclass, field
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.client.stdio import stdio_client, StdioServerParameters
from loguru import logger


@dataclass
class MCPServerConnection:
    """Configuration for an external MCP server."""
    name: str
    transport: str  # "streamable-http" or "stdio"
    url: str = ""  # For HTTP transport
    command: str = ""  # For stdio transport (e.g., "npx @mcp/server-github")
    args: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)


class MCPClient:
    """Client for discovering and invoking tools on external MCP servers.

    Supports connecting to multiple MCP servers simultaneously,
    merging their tool catalogs into a unified interface.
    """

    def __init__(self):
        self.connections: dict[str, MCPServerConnection] = {}
        self.sessions: dict[str, ClientSession] = {}
        self.tool_catalog: dict[str, dict] = {}  # tool_name → {server, schema}

    async def connect(self, server: MCPServerConnection) -> None:
        """Connect to an MCP server and discover its tools."""
        self.connections[server.name] = server

        if server.transport == "stdio":
            params = StdioServerParameters(
                command=server.command,
                args=server.args,
                env=server.env,
            )
            transport = stdio_client(params)
        else:
            transport = streamablehttp_client(server.url)

        read_stream, write_stream = await transport.__aenter__()
        session = ClientSession(read_stream, write_stream)
        await session.initialize()
        self.sessions[server.name] = session

        # Discover tools
        tools_response = await session.list_tools()
        for tool in tools_response.tools:
            self.tool_catalog[tool.name] = {
                "server": server.name,
                "description": tool.description,
                "input_schema": tool.inputSchema,
            }
            logger.info(f"Discovered tool: {tool.name} from {server.name}")

    async def list_tools(self) -> list[dict]:
        """List all discovered tools across all connected servers."""
        return [
            {
                "name": name,
                "description": info["description"],
                "server": info["server"],
                "parameters": info["input_schema"],
            }
            for name, info in self.tool_catalog.items()
        ]

    async def call_tool(self, tool_name: str, arguments: dict) -> str:
        """Invoke a tool on its originating MCP server."""
        if tool_name not in self.tool_catalog:
            raise ValueError(f"Unknown tool: {tool_name}")

        server_name = self.tool_catalog[tool_name]["server"]
        session = self.sessions[server_name]

        result = await session.call_tool(tool_name, arguments)
        return result.content[0].text if result.content else ""

    async def get_tools_for_provider(self) -> list[dict]:
        """Convert discovered tools to provider-compatible tool definitions.

        Returns tool definitions in the universal format that any
        AIProvider can convert to its native format.
        """
        return [
            {
                "name": name,
                "description": info["description"],
                "parameters": info["input_schema"],
            }
            for name, info in self.tool_catalog.items()
        ]

    async def disconnect_all(self) -> None:
        """Disconnect from all MCP servers."""
        for name, session in self.sessions.items():
            try:
                await session.close()
            except Exception:
                pass
        self.sessions.clear()
        self.tool_catalog.clear()


# Example: connect to common MCP servers
async def setup_mcp_clients() -> MCPClient:
    """Set up MCP client connections for {PROJECT_NAME}."""
    client = MCPClient()

    # Connect to GitHub MCP server (for repo data)
    await client.connect(MCPServerConnection(
        name="github",
        transport="stdio",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-github"],
        env={"GITHUB_PERSONAL_ACCESS_TOKEN": "{GITHUB_TOKEN}"},
    ))

    # Connect to our own app's MCP server
    await client.connect(MCPServerConnection(
        name="{MCP_SERVER_NAME}",
        transport="streamable-http",
        url="http://localhost:{MCP_SERVER_PORT}/mcp",
    ))

    # Connect to filesystem MCP server (for local file access)
    await client.connect(MCPServerConnection(
        name="filesystem",
        transport="stdio",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
    ))

    logger.info(f"MCP client connected to {len(client.connections)} servers, "
                f"discovered {len(client.tool_catalog)} tools")

    return client
```

### 8.2 Integrating MCP Tools into Agent Tool Belts

```python
# src/ai_agent/mcp/agent_integration.py
"""Wire MCP-discovered tools into the agent orchestration layer."""

from src.ai_agent.mcp.client import MCPClient
from src.ai_agent.providers.base import AIProvider


async def create_mcp_enhanced_agent(
    provider: AIProvider,
    mcp_client: MCPClient,
    system_prompt: str = "",
) -> str:
    """Create an agent that can use both local and MCP-provided tools.

    This merges MCP-discovered tools with locally defined tools,
    giving the agent access to both the application's data AND
    external data sources.
    """
    # Get MCP tools in universal format
    mcp_tools = await mcp_client.get_tools_for_provider()

    # Add local tools
    local_tools = [
        {
            "name": "calculate_risk_score",
            "description": "Calculate risk score for a repository based on findings",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo_name": {"type": "string"},
                },
                "required": ["repo_name"],
            },
        },
    ]

    all_tools = mcp_tools + local_tools

    async def agent_loop(query: str, max_iterations: int = 10) -> str:
        messages = [{"role": "user", "content": query}]

        for _ in range(max_iterations):
            response = await provider.generate(
                messages=messages,
                system=system_prompt,
                tools=all_tools,
            )

            if not response.tool_calls:
                return response.content

            # Execute tool calls
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []

            for tc in response.tool_calls:
                if tc["name"] in mcp_client.tool_catalog:
                    # MCP tool — delegate to MCP server
                    result = await mcp_client.call_tool(tc["name"], tc["arguments"])
                else:
                    # Local tool — execute directly
                    result = await _execute_local_tool(tc["name"], tc["arguments"])

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tc["id"],
                    "content": result,
                })

            messages.append({"role": "user", "content": tool_results})

        return "Max iterations reached."

    return agent_loop
```

---

## 9. Skills Registry System

### 9.1 Skill Definition Schema

```python
# src/ai_agent/skills/base.py
"""Base skill class and schema for the {PROJECT_NAME} skills registry."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional
from enum import Enum


class SkillCategory(str, Enum):
    """Categories for organizing skills."""
    ANALYSIS = "analysis"
    REMEDIATION = "remediation"
    REPORTING = "reporting"
    INVESTIGATION = "investigation"
    MONITORING = "monitoring"
    CUSTOM = "custom"


@dataclass
class SkillMetadata:
    """Metadata describing a skill."""
    name: str
    version: str  # Semver: "1.0.0"
    description: str
    category: SkillCategory
    author: str = "{PROJECT_NAME}"
    tags: list[str] = field(default_factory=list)
    requires_tools: list[str] = field(default_factory=list)
    estimated_cost: float = 0.0  # Estimated USD per invocation
    estimated_tokens: int = 0
    max_timeout: int = {AGENT_TIMEOUT_SECONDS}


class BaseSkill(ABC):
    """Abstract base class for all skills.

    A skill is a composable, versioned unit of AI capability
    that combines a system prompt, tools, and execution logic.
    """

    def __init__(self, metadata: SkillMetadata):
        self.metadata = metadata

    @abstractmethod
    async def execute(self, context: dict[str, Any], **kwargs) -> dict[str, Any]:
        """Execute the skill with the given context.

        Args:
            context: Execution context including provider, tools, user input
            **kwargs: Skill-specific parameters

        Returns:
            Result dict with at minimum: {"output": str, "success": bool}
        """
        ...

    @property
    @abstractmethod
    def system_prompt(self) -> str:
        """The system prompt for this skill's AI interactions."""
        ...

    @property
    def tools(self) -> list[dict]:
        """Tool definitions this skill needs. Override if skill uses tools."""
        return []
```

### 9.2 Built-in Skills

```python
# src/ai_agent/skills/builtin/triage.py
"""Triage skill — classify and prioritize security findings."""

from src.ai_agent.skills.base import BaseSkill, SkillMetadata, SkillCategory
from src.ai_agent.providers.base import AIProvider
import json


class TriageSkill(BaseSkill):
    """AI-powered finding triage with priority classification."""

    def __init__(self):
        super().__init__(SkillMetadata(
            name="triage",
            version="1.0.0",
            description="Classify security findings by priority and false positive probability",
            category=SkillCategory.ANALYSIS,
            tags=["security", "triage", "classification"],
            estimated_cost=0.02,
            estimated_tokens=2000,
        ))

    @property
    def system_prompt(self) -> str:
        return (
            "You are a security finding triage expert for {PROJECT_NAME}. "
            "Classify findings accurately based on severity, exploitability, "
            "and context. Return JSON with: priority (P0-P4), confidence (0-1), "
            "false_positive_probability (0-1), reasoning, recommended_action."
        )

    async def execute(self, context: dict, **kwargs) -> dict:
        provider: AIProvider = context["provider"]
        finding_data = kwargs.get("finding", {})

        response = await provider.generate(
            messages=[{"role": "user", "content": json.dumps(finding_data)}],
            system=self.system_prompt,
            response_format={"type": "json_object"},
        )

        try:
            result = json.loads(response.content)
            return {"output": result, "success": True, "cost": response.cost}
        except json.JSONDecodeError:
            return {"output": response.content, "success": False, "cost": response.cost}


# src/ai_agent/skills/builtin/remediation.py
"""Remediation skill — generate fix code for vulnerabilities."""


class RemediationSkill(BaseSkill):
    """AI-powered remediation code generation."""

    def __init__(self):
        super().__init__(SkillMetadata(
            name="remediation",
            version="1.0.0",
            description="Generate remediation code and diffs for security vulnerabilities",
            category=SkillCategory.REMEDIATION,
            tags=["security", "code-generation", "fix"],
            estimated_cost=0.05,
            estimated_tokens=4000,
        ))

    @property
    def system_prompt(self) -> str:
        return (
            "You are a secure coding expert. Generate specific, tested remediation "
            "code for security vulnerabilities. Always provide:\n"
            "1. Explanation of the vulnerability\n"
            "2. Fixed code as a unified diff\n"
            "3. Testing approach to verify the fix\n"
            "Return JSON: {remediation_text, diff, confidence, testing_notes}"
        )

    async def execute(self, context: dict, **kwargs) -> dict:
        provider: AIProvider = context["provider"]
        vuln_type = kwargs.get("vuln_type", "")
        language = kwargs.get("language", "")
        code_context = kwargs.get("context", "")

        prompt = (
            f"Vulnerability: {vuln_type}\n"
            f"Language: {language}\n"
            f"Code context:\n```\n{code_context}\n```"
        )

        response = await provider.generate(
            messages=[{"role": "user", "content": prompt}],
            system=self.system_prompt,
        )
        return {"output": response.content, "success": True, "cost": response.cost}


# src/ai_agent/skills/builtin/zero_day.py
"""Zero-day investigation skill — multi-step tool-use analysis."""


class ZeroDayInvestigationSkill(BaseSkill):
    """AI-powered zero-day vulnerability investigation with tool use."""

    def __init__(self):
        super().__init__(SkillMetadata(
            name="zero_day_investigation",
            version="1.0.0",
            description="Investigate potential zero-day vulnerabilities using database search tools",
            category=SkillCategory.INVESTIGATION,
            tags=["security", "zero-day", "investigation", "tool-use"],
            requires_tools=["search_findings", "search_dependencies", "search_languages"],
            estimated_cost=0.15,
            estimated_tokens=8000,
        ))

    @property
    def system_prompt(self) -> str:
        return (
            "You are a zero-day vulnerability researcher for {PROJECT_NAME}. "
            "Use the available search tools to investigate potential impacts. "
            "First create a search plan, execute searches, then synthesize findings."
        )

    @property
    def tools(self) -> list[dict]:
        return [
            {
                "name": "search_findings",
                "description": "Search findings by keyword and severity",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "severity": {"type": "string"},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "search_dependencies",
                "description": "Search for a dependency across all repos",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "package_name": {"type": "string"},
                    },
                    "required": ["package_name"],
                },
            },
        ]

    async def execute(self, context: dict, **kwargs) -> dict:
        """Execute zero-day investigation with tool use loop."""
        from src.ai_agent.frameworks.raw_api import raw_agent_loop

        query = kwargs.get("query", "")
        result = await raw_agent_loop(
            user_prompt=query,
            system_prompt=self.system_prompt,
            max_iterations=8,
        )
        return {"output": result, "success": True}
```

### 9.3 Skills Registry

```python
# src/ai_agent/skills/registry.py
"""Skills registry — discover, register, and invoke skills."""

from typing import Optional
from loguru import logger
from src.ai_agent.skills.base import BaseSkill, SkillCategory


class SkillsRegistry:
    """Central registry for all available skills.

    Supports:
    - Registration of built-in and custom skills
    - Discovery by name, category, or tags
    - Version management (multiple versions coexist)
    - Execution with provider injection
    """

    def __init__(self):
        self._skills: dict[str, dict[str, BaseSkill]] = {}  # name → {version → skill}

    def register(self, skill: BaseSkill) -> None:
        """Register a skill in the registry."""
        name = skill.metadata.name
        version = skill.metadata.version

        if name not in self._skills:
            self._skills[name] = {}

        self._skills[name][version] = skill
        logger.info(f"Registered skill: {name} v{version}")

    def get(self, name: str, version: str = "latest") -> Optional[BaseSkill]:
        """Get a skill by name and version."""
        if name not in self._skills:
            return None
        versions = self._skills[name]
        if version == "latest":
            latest = max(versions.keys())
            return versions[latest]
        return versions.get(version)

    def list_skills(
        self,
        category: Optional[SkillCategory] = None,
        tag: Optional[str] = None,
    ) -> list[dict]:
        """List available skills, optionally filtered."""
        results = []
        for name, versions in self._skills.items():
            for ver, skill in versions.items():
                if category and skill.metadata.category != category:
                    continue
                if tag and tag not in skill.metadata.tags:
                    continue
                results.append({
                    "name": name,
                    "version": ver,
                    "description": skill.metadata.description,
                    "category": skill.metadata.category.value,
                    "tags": skill.metadata.tags,
                    "estimated_cost": skill.metadata.estimated_cost,
                })
        return results

    async def invoke(
        self,
        skill_name: str,
        context: dict,
        version: str = "latest",
        **kwargs,
    ) -> dict:
        """Invoke a skill by name."""
        skill = self.get(skill_name, version)
        if not skill:
            raise ValueError(f"Skill not found: {skill_name} v{version}")

        logger.info(f"Invoking skill: {skill_name} v{skill.metadata.version}")
        return await skill.execute(context, **kwargs)


# Initialize global registry with built-in skills
def create_default_registry() -> SkillsRegistry:
    """Create registry pre-loaded with built-in skills."""
    from src.ai_agent.skills.builtin.triage import TriageSkill
    from src.ai_agent.skills.builtin.remediation import RemediationSkill
    from src.ai_agent.skills.builtin.zero_day import ZeroDayInvestigationSkill

    registry = SkillsRegistry()
    registry.register(TriageSkill())
    registry.register(RemediationSkill())
    registry.register(ZeroDayInvestigationSkill())
    return registry
```

> **AuditGH Reference:** While AuditGH doesn't have a formal skills registry, its `AIAgent` class in `src/ai_agent/agent.py` effectively bundles skills as methods: `analyze_stuck_scan()`, `generate_remediation()`, `triage_finding()`, `analyze_component()`, and `generate_architecture_overview()`. This plan formalizes those into composable, versioned, discoverable skills.

---

## 10. Tool Definitions & Function Calling

### 10.1 Universal Tool Schema

```python
# src/ai_agent/tools/registry.py
"""Tool registry and executor — unified interface for all tool types."""

import json
import asyncio
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable, Optional
from loguru import logger


@dataclass
class ToolDefinition:
    """Universal tool definition compatible with all providers."""
    name: str
    description: str
    parameters: dict  # JSON Schema
    handler: Callable[..., Any] | Callable[..., Awaitable[Any]]
    is_async: bool = False
    requires_db: bool = False
    requires_auth: bool = False
    max_retries: int = 1
    timeout: int = 30


class ToolRegistry:
    """Central registry for all tools available to AI agents.

    Manages tool definitions, execution, validation, and error handling.
    Tools can be local functions, MCP-provided, or external API calls.
    """

    def __init__(self):
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        """Register a tool."""
        self._tools[tool.name] = tool

    def register_function(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: Callable,
        **kwargs,
    ) -> None:
        """Convenience method to register a function as a tool."""
        self.register(ToolDefinition(
            name=name,
            description=description,
            parameters=parameters,
            handler=handler,
            is_async=asyncio.iscoroutinefunction(handler),
            **kwargs,
        ))

    def get_definitions(self, names: list[str] | None = None) -> list[dict]:
        """Get tool definitions in universal format for AI providers."""
        tools = self._tools.values()
        if names:
            tools = [t for t in tools if t.name in names]
        return [
            {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            }
            for t in tools
        ]

    async def execute(self, tool_name: str, arguments: dict) -> str:
        """Execute a tool by name with the given arguments.

        Returns:
            JSON string of the tool result
        """
        if tool_name not in self._tools:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})

        tool = self._tools[tool_name]

        try:
            # Validate arguments against schema (basic)
            required = tool.parameters.get("required", [])
            for param in required:
                if param not in arguments:
                    return json.dumps({"error": f"Missing required parameter: {param}"})

            # Execute handler
            if tool.is_async:
                result = await tool.handler(**arguments)
            else:
                result = await asyncio.to_thread(tool.handler, **arguments)

            return json.dumps(result, default=str) if not isinstance(result, str) else result

        except Exception as e:
            logger.error(f"Tool execution failed ({tool_name}): {e}")
            return json.dumps({"error": str(e)})

    async def execute_parallel(self, tool_calls: list[dict]) -> list[dict]:
        """Execute multiple tool calls in parallel."""
        tasks = [
            self.execute(tc["name"], tc["arguments"])
            for tc in tool_calls
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [
            {
                "tool_use_id": tc.get("id", f"tool_{i}"),
                "content": str(r) if isinstance(r, Exception) else r,
            }
            for i, (tc, r) in enumerate(zip(tool_calls, results))
        ]
```

### 10.2 Database Tools

```python
# src/ai_agent/tools/db_tools.py
"""Database search tools for AI agents."""

from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional


def search_findings(
    db: Session,
    query: str,
    severity_filter: Optional[str] = None,
    finding_types: Optional[list[str]] = None,
    organization_id: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    """Search {PROJECT_NAME} findings by keyword and filters.

    Uses PostgreSQL full-text search for efficient matching.
    Multi-tenant safe: always scopes by organization_id when provided.
    """
    from src.api.models import Finding, Repository

    q = db.query(Finding).join(Repository)

    # Multi-tenant isolation
    if organization_id:
        q = q.filter(Repository.organization_id == organization_id)

    # Keyword search (title + description)
    if query:
        search_term = f"%{query}%"
        q = q.filter(or_(
            Finding.title.ilike(search_term),
            Finding.description.ilike(search_term),
        ))

    # Severity filter
    if severity_filter:
        q = q.filter(Finding.severity == severity_filter)

    # Type filter
    if finding_types:
        q = q.filter(Finding.finding_type.in_(finding_types))

    results = q.order_by(Finding.severity.desc()).limit(limit).all()

    return [
        {
            "id": str(f.id),
            "title": f.title,
            "severity": f.severity,
            "scanner": f.scanner,
            "repository": f.repository.full_name if f.repository else "",
            "file_path": f.file_path,
            "finding_type": f.finding_type,
        }
        for f in results
    ]


def search_dependencies(
    db: Session,
    package_name: str,
    version_spec: Optional[str] = None,
    use_fuzzy: bool = True,
    organization_id: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    """Search for a package/dependency across all repositories.

    Supports fuzzy matching for package name variations.
    """
    from src.api.models import Dependency, Repository

    q = db.query(Dependency).join(Repository)

    if organization_id:
        q = q.filter(Repository.organization_id == organization_id)

    if use_fuzzy:
        q = q.filter(Dependency.name.ilike(f"%{package_name}%"))
    else:
        q = q.filter(Dependency.name == package_name)

    if version_spec:
        q = q.filter(Dependency.version.ilike(f"%{version_spec}%"))

    results = q.limit(limit).all()

    return [
        {
            "name": d.name,
            "version": d.version,
            "repository": d.repository.full_name if d.repository else "",
            "manager": d.package_manager,
        }
        for d in results
    ]


def search_all_sources(
    db: Session,
    query: str,
    scopes: Optional[list[str]] = None,
    organization_id: Optional[str] = None,
) -> dict:
    """Search across multiple data sources simultaneously.

    Scopes: findings, dependencies, repositories, languages
    """
    scopes = scopes or ["findings", "dependencies"]
    results = {}

    if "findings" in scopes:
        results["findings"] = search_findings(db, query, organization_id=organization_id)
    if "dependencies" in scopes:
        results["dependencies"] = search_dependencies(db, query, organization_id=organization_id)

    return results
```

### 10.3 Registering Tools

```python
# src/ai_agent/tools/__init__.py
"""Initialize and register all tools."""

from src.ai_agent.tools.registry import ToolRegistry
from src.ai_agent.tools.db_tools import (
    search_findings,
    search_dependencies,
    search_all_sources,
)


def create_default_tool_registry() -> ToolRegistry:
    """Create a tool registry with all {PROJECT_NAME} tools pre-registered."""
    registry = ToolRegistry()

    registry.register_function(
        name="search_findings",
        description="Search security findings by keyword, severity, and type",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term"},
                "severity_filter": {
                    "type": "string",
                    "enum": ["critical", "high", "medium", "low"],
                    "description": "Optional severity filter",
                },
                "organization_id": {"type": "string", "description": "Tenant scope"},
            },
            "required": ["query"],
        },
        handler=search_findings,
        requires_db=True,
    )

    registry.register_function(
        name="search_dependencies",
        description="Search for a package/dependency across all repositories",
        parameters={
            "type": "object",
            "properties": {
                "package_name": {"type": "string", "description": "Package name"},
                "version_spec": {"type": "string", "description": "Version constraint"},
                "organization_id": {"type": "string", "description": "Tenant scope"},
            },
            "required": ["package_name"],
        },
        handler=search_dependencies,
        requires_db=True,
    )

    registry.register_function(
        name="search_all_sources",
        description="Search across findings, dependencies, and repositories simultaneously",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term"},
                "scopes": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["findings", "dependencies"]},
                    "description": "Which data sources to search",
                },
            },
            "required": ["query"],
        },
        handler=search_all_sources,
        requires_db=True,
    )

    return registry
```

> **AuditGH Reference:** The production tools at `src/ai_agent/tools/db_tools.py` include `search_dependencies()`, `search_findings()`, `search_languages()`, `search_repositories_by_technology()`, and `search_all_sources()`. The zero-day analysis in `reasoning.py` executes these tools in a planning-execution loop where the AI generates a search plan, the system executes tools, and results are fed back for synthesis.

---

## 11. Prompt Engineering Patterns

### 11.1 System Prompt Architecture

```python
# src/ai_agent/prompts/system.py
"""System prompt templates for different AI agent roles."""

from string import Template


# Base system prompt with shared instructions
BASE_SYSTEM = Template("""You are an expert $role for {PROJECT_NAME}.

CORE INSTRUCTIONS:
- Always cite specific evidence from data (IDs, file paths, versions)
- Return structured JSON when requested — never return markdown in JSON fields
- If uncertain, state your confidence level explicitly (0.0-1.0)
- Never fabricate data — if a tool search returns no results, say so
- Scope all data access to the current {TENANT_ENTITY}

$domain_instructions""")


ROLE_PROMPTS = {
    "triage_analyst": BASE_SYSTEM.substitute(
        role="security triage analyst",
        domain_instructions=(
            "TRIAGE INSTRUCTIONS:\n"
            "- Classify findings as: P0 (critical, exploit available), "
            "P1 (high, exploitable), P2 (medium), P3 (low), P4 (informational)\n"
            "- Assess false positive probability based on context\n"
            "- Consider the finding's scanner confidence and detection method\n"
            "- Return JSON: {priority, confidence, false_positive_probability, reasoning, action}"
        ),
    ),

    "remediation_engineer": BASE_SYSTEM.substitute(
        role="secure coding remediation engineer",
        domain_instructions=(
            "REMEDIATION INSTRUCTIONS:\n"
            "- Generate production-ready fix code, not pseudocode\n"
            "- Always provide fixes as unified diffs\n"
            "- Explain WHY the fix works (not just what it changes)\n"
            "- Consider backward compatibility\n"
            "- Include test cases to verify the fix\n"
            "- Return JSON: {remediation_text, diff, confidence, test_approach}"
        ),
    ),

    "architecture_reviewer": BASE_SYSTEM.substitute(
        role="software architecture reviewer",
        domain_instructions=(
            "ARCHITECTURE REVIEW INSTRUCTIONS:\n"
            "- Analyze repository structure, dependencies, and design patterns\n"
            "- Identify security anti-patterns and configuration risks\n"
            "- Assess deployment architecture and infrastructure concerns\n"
            "- Provide actionable recommendations ranked by impact\n"
            "- Return structured markdown with clear sections"
        ),
    ),

    "zero_day_researcher": BASE_SYSTEM.substitute(
        role="zero-day vulnerability researcher",
        domain_instructions=(
            "ZERO-DAY RESEARCH INSTRUCTIONS:\n"
            "- First, create a search plan identifying which tools to use\n"
            "- Execute searches systematically (dependencies, findings, languages)\n"
            "- Cross-reference results across multiple data sources\n"
            "- Assess blast radius: how many repos/services are affected\n"
            "- Provide immediate mitigation recommendations\n"
            "- Return: {answer, affected_repositories[], plan, execution_summary}"
        ),
    ),
}
```

### 11.2 Structured Output Enforcement

```python
# src/ai_agent/prompts/formatting.py
"""Output format enforcement for consistent AI responses."""

import json
import re
from typing import Any


# JSON extraction with fallback
def extract_json(content: str) -> dict | list | None:
    """Extract JSON from AI response, handling common formatting issues.

    Handles:
    - JSON wrapped in ```json code blocks
    - Trailing commas
    - Single quotes (converts to double)
    - Incomplete JSON (attempts auto-completion)
    """
    # Try direct parse first
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Extract from code blocks
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Try fixing common issues
    cleaned = content.strip()
    # Remove trailing commas before } or ]
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    # Fix single quotes
    cleaned = cleaned.replace("'", '"')

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Last resort: find first { or [ and match to end
    for start_char, end_char in [("{", "}"), ("[", "]")]:
        start = content.find(start_char)
        if start != -1:
            end = content.rfind(end_char)
            if end > start:
                try:
                    return json.loads(content[start : end + 1])
                except json.JSONDecodeError:
                    pass

    return None


# Response format specifications
RESPONSE_FORMATS = {
    "triage": {
        "type": "json_schema",
        "json_schema": {
            "name": "triage_response",
            "schema": {
                "type": "object",
                "properties": {
                    "priority": {"type": "string", "enum": ["P0", "P1", "P2", "P3", "P4"]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "false_positive_probability": {"type": "number", "minimum": 0, "maximum": 1},
                    "reasoning": {"type": "string"},
                    "recommended_action": {"type": "string", "enum": ["fix", "accept_risk", "investigate", "false_positive"]},
                },
                "required": ["priority", "confidence", "reasoning", "recommended_action"],
            },
        },
    },
    "remediation": {
        "type": "json_schema",
        "json_schema": {
            "name": "remediation_response",
            "schema": {
                "type": "object",
                "properties": {
                    "remediation_text": {"type": "string"},
                    "diff": {"type": "string"},
                    "confidence": {"type": "number"},
                    "testing_notes": {"type": "string"},
                },
                "required": ["remediation_text", "diff"],
            },
        },
    },
}
```

### 11.3 Context Window Management

```python
# src/ai_agent/prompts/context.py
"""Context window management for large inputs."""

from typing import Optional


def truncate_context(
    text: str,
    max_chars: int = 100_000,
    strategy: str = "tail",
) -> str:
    """Truncate text to fit context window limits.

    Strategies:
    - 'tail': Keep the end (most recent/relevant)
    - 'head': Keep the beginning
    - 'middle': Keep start and end, truncate middle
    - 'smart': Preserve section headers, truncate content
    """
    if len(text) <= max_chars:
        return text

    if strategy == "tail":
        return f"[...truncated {len(text) - max_chars} chars...]\n" + text[-max_chars:]
    elif strategy == "head":
        return text[:max_chars] + f"\n[...truncated {len(text) - max_chars} chars...]"
    elif strategy == "middle":
        half = max_chars // 2
        return (
            text[:half]
            + f"\n\n[...truncated {len(text) - max_chars} chars...]\n\n"
            + text[-half:]
        )
    elif strategy == "smart":
        # Keep lines that look like headers
        lines = text.split("\n")
        kept = []
        current_len = 0
        for line in lines:
            is_header = line.startswith("#") or line.startswith("##") or line.isupper()
            line_len = len(line) + 1
            if current_len + line_len > max_chars and not is_header:
                continue
            kept.append(line)
            current_len += line_len
        return "\n".join(kept)

    return text[:max_chars]


def build_conversation_context(
    messages: list[dict],
    max_tokens: int = 100_000,
    preserve_last_n: int = 5,
) -> list[dict]:
    """Trim conversation history to fit context window.

    Always preserves the first (system) message and last N messages.
    Summarizes older messages if needed.
    """
    if len(messages) <= preserve_last_n + 1:
        return messages

    # Always keep first and last N
    first = messages[0]
    last_n = messages[-preserve_last_n:]
    middle = messages[1:-preserve_last_n]

    # Estimate tokens (rough: 1 token ≈ 4 chars)
    total_chars = sum(len(m.get("content", "")) for m in messages)
    if total_chars / 4 < max_tokens:
        return messages

    # Summarize middle messages
    summary = f"[Previous {len(middle)} messages summarized: "
    topics = set()
    for m in middle:
        content = m.get("content", "")[:200]
        if "tool" in content.lower():
            topics.add("tool usage")
        if "error" in content.lower():
            topics.add("error handling")
        if "search" in content.lower():
            topics.add("data search")
    summary += ", ".join(topics) if topics else "general discussion"
    summary += "]"

    return [first, {"role": "user", "content": summary}] + last_n
```

> **AuditGH Reference:** Production prompts are embedded in provider implementations. `claude.py` contains specialized prompts for stuck scan analysis (lines 289-336), remediation generation (315-339), finding triage (416-439), and component analysis (499-517). The JSON extraction fallback pattern handles incomplete JSON from model responses.

---

## 12. AI Analysis Pipeline

### 12.1 Pipeline Framework

```python
# src/ai_agent/reasoning.py
"""ReasoningEngine: orchestrates multi-step AI analysis with tool use."""

import json
import asyncio
from dataclasses import dataclass, field
from typing import Any, Optional
from loguru import logger
from src.ai_agent.providers.base import AIProvider, AIResponse
from src.ai_agent.tools.registry import ToolRegistry
from src.ai_agent.prompts.formatting import extract_json


@dataclass
class AnalysisResult:
    """Result of an AI analysis pipeline execution."""
    answer: str
    plan: list[dict] = field(default_factory=list)
    tool_executions: list[dict] = field(default_factory=list)
    total_tokens: int = 0
    total_cost: float = 0.0
    iterations: int = 0
    success: bool = True
    error: str = ""


class ReasoningEngine:
    """Orchestrates multi-step AI analysis with tool use.

    Implements the Plan → Execute → Synthesize pattern:
    1. PLAN: AI creates a search/analysis plan (which tools, what arguments)
    2. EXECUTE: System executes tools and collects results
    3. SYNTHESIZE: AI combines tool results into final answer
    """

    def __init__(
        self,
        provider: AIProvider,
        tool_registry: ToolRegistry,
        max_iterations: int = 10,
        max_cost_per_analysis: float = {MAX_COST_PER_ANALYSIS},
    ):
        self.provider = provider
        self.tools = tool_registry
        self.max_iterations = max_iterations
        self.max_cost = max_cost_per_analysis
        self.analysis_history: list[AnalysisResult] = []

    async def analyze(
        self,
        query: str,
        system_prompt: str = "",
        context: dict | None = None,
    ) -> AnalysisResult:
        """Run a complete analysis with planning and tool execution."""
        result = AnalysisResult()
        messages = [{"role": "user", "content": self._build_query(query, context)}]
        tool_defs = self.tools.get_definitions()

        for iteration in range(self.max_iterations):
            # Check cost budget
            if result.total_cost >= self.max_cost:
                logger.warning(f"Analysis cost limit reached: ${result.total_cost:.4f}")
                result.error = "Cost limit reached"
                break

            response = await self.provider.generate(
                messages=messages,
                system=system_prompt or self._default_system_prompt(),
                tools=tool_defs if tool_defs else None,
            )
            result.total_tokens += response.total_tokens
            result.total_cost += response.cost
            result.iterations = iteration + 1

            # No tool calls → final response
            if not response.tool_calls:
                result.answer = response.content
                break

            # Execute tool calls
            messages.append({"role": "assistant", "content": response.content})
            tool_results_content = []

            for tc in response.tool_calls:
                logger.info(f"ReasoningEngine: executing {tc['name']}({tc['arguments']})")
                tool_result = await self.tools.execute(tc["name"], tc["arguments"])
                result.tool_executions.append({
                    "tool": tc["name"],
                    "args": tc["arguments"],
                    "result_preview": tool_result[:500],
                })
                tool_results_content.append({
                    "type": "tool_result",
                    "tool_use_id": tc["id"],
                    "content": tool_result,
                })

            messages.append({"role": "user", "content": tool_results_content})

        self.analysis_history.append(result)
        return result

    def _build_query(self, query: str, context: dict | None) -> str:
        """Build the analysis query with optional context."""
        parts = [query]
        if context:
            if "organization_id" in context:
                parts.append(f"\nScope: {TENANT_ENTITY} ID {context['organization_id']}")
            if "repository" in context:
                parts.append(f"Repository: {context['repository']}")
        return "\n".join(parts)

    def _default_system_prompt(self) -> str:
        return (
            "You are an expert analyst for {PROJECT_NAME}. "
            "Use the available tools to search for evidence before answering. "
            "Cite specific data from tool results. Be precise and actionable."
        )
```

### 12.2 Specialized Analysis Pipelines

```python
# Example: Zero-day investigation pipeline
async def zero_day_analysis(
    provider: AIProvider,
    tool_registry: ToolRegistry,
    query: str,
    organization_id: str = "",
) -> AnalysisResult:
    """Execute a zero-day vulnerability investigation.

    Pipeline:
    1. AI generates search plan (which tools, what to search for)
    2. System executes database searches
    3. AI synthesizes results with blast radius assessment
    """
    engine = ReasoningEngine(
        provider=provider,
        tool_registry=tool_registry,
        max_iterations=8,
        max_cost_per_analysis=0.50,
    )

    system_prompt = (
        "You are a zero-day vulnerability researcher for {PROJECT_NAME}. "
        "Investigate the user's query by:\n"
        "1. Searching for affected dependencies across all repositories\n"
        "2. Checking for existing findings related to this vulnerability\n"
        "3. Assessing the blast radius (how many repos/services affected)\n"
        "4. Providing immediate mitigation recommendations\n\n"
        "Return your final answer as JSON: "
        "{answer, affected_repositories[], severity_assessment, mitigation_steps[]}"
    )

    return await engine.analyze(
        query=query,
        system_prompt=system_prompt,
        context={"organization_id": organization_id},
    )
```

> **AuditGH Reference:** The production `ReasoningEngine` at `src/ai_agent/reasoning.py` implements this exact pattern for zero-day analysis. It generates a search plan (lines 262-300), executes tools (300-380), and synthesizes results (380-430). The system supports `search_dependencies`, `search_findings`, `search_languages`, and `search_repositories_by_technology` tools.

---

## 13. Conversation & Memory Management

### 13.1 Conversation Manager

```python
# src/ai_agent/conversations.py
"""Multi-turn conversation management with persistence."""

import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from loguru import logger


class ConversationManager:
    """Manages multi-turn AI conversations with database persistence.

    Features:
    - Create and resume conversations
    - Track messages with role, content, thinking, tokens, cost
    - Citation tracking (which data sources the AI referenced)
    - Context window management for long conversations
    """

    def __init__(self, db: Session):
        self.db = db

    def create_conversation(
        self,
        title: str,
        focus: str = "general",
        project_id: str = "",
        repository_id: str = "",
    ) -> str:
        """Create a new conversation and return its ID."""
        from src.api.models import AIConversation

        conversation = AIConversation(
            conversation_id=str(uuid.uuid4()),
            title=title,
            focus=focus,
            project_id=project_id or None,
            repository_id=repository_id or None,
            is_active=True,
            message_count=0,
        )
        self.db.add(conversation)
        self.db.commit()
        return conversation.conversation_id

    def add_message(
        self,
        conversation_id: str,
        role: str,  # "user", "assistant", "system"
        content: str,
        thinking: str = "",
        tokens_used: int = 0,
        cost: float = 0.0,
        context_used: dict = None,
        citations: list[dict] = None,
    ) -> str:
        """Add a message to a conversation."""
        from src.api.models import AIConversation, AIMessage, AICitation

        conversation = self.db.query(AIConversation).filter(
            AIConversation.conversation_id == conversation_id
        ).first()

        if not conversation:
            raise ValueError(f"Conversation not found: {conversation_id}")

        message = AIMessage(
            conversation_id=conversation.id,
            role=role,
            content=content,
            thinking=thinking,
            tokens_used=tokens_used,
            context_used=context_used or {},
        )
        self.db.add(message)

        # Add citations
        if citations:
            for cite in citations:
                citation = AICitation(
                    message_id=message.id,
                    type=cite.get("type", "DOCUMENTATION"),
                    source=cite.get("source", ""),
                    reference=cite.get("reference", ""),
                    excerpt=cite.get("excerpt", ""),
                    url=cite.get("url", ""),
                    relevance_score=cite.get("relevance_score", 0.5),
                )
                self.db.add(citation)

        conversation.message_count += 1
        conversation.updated_at = datetime.utcnow()
        self.db.commit()

        return str(message.id)

    def get_conversation_messages(
        self,
        conversation_id: str,
        limit: int = 50,
    ) -> list[dict]:
        """Get messages for a conversation, formatted for AI provider."""
        from src.api.models import AIConversation, AIMessage

        conversation = self.db.query(AIConversation).filter(
            AIConversation.conversation_id == conversation_id
        ).first()

        if not conversation:
            return []

        messages = self.db.query(AIMessage).filter(
            AIMessage.conversation_id == conversation.id
        ).order_by(AIMessage.created_at.asc()).limit(limit).all()

        return [
            {"role": m.role.lower(), "content": m.content}
            for m in messages
        ]
```

> **AuditGH Reference:** Production models `AIConversation`, `AIMessage`, and `AICitation` in `src/api/models.py` track multi-turn conversations with citation types: REPOSITORY, SCAN_RESULT, VULNERABILITY, WEB, DOCUMENTATION. Messages include `thinking` (chain-of-thought), `confidence_score`, and `web_search_performed` fields.

---

## 14. Cost Tracking & Budget Management

### 14.1 Cost Tracker

```python
# src/ai_agent/cost.py
"""Cost tracking and budget management for AI operations."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional
from loguru import logger


# Per-provider cost tables (USD per million tokens)
COST_TABLE = {
    "claude-sonnet-4": {"input": 3.00, "output": 15.00},
    "claude-opus-4": {"input": 15.00, "output": 75.00},
    "claude-haiku-4": {"input": 0.80, "output": 4.00},
    "gpt-4o": {"input": 5.00, "output": 15.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gemini-1.5-pro": {"input": 3.50, "output": 10.50},
    "ollama/*": {"input": 0.00, "output": 0.00},
    "docker/*": {"input": 0.00, "output": 0.00},
}


@dataclass
class UsageRecord:
    """Single AI operation usage record."""
    timestamp: datetime
    provider: str
    model: str
    operation: str  # e.g., "triage", "remediation", "zero_day"
    input_tokens: int
    output_tokens: int
    cost: float
    user_id: str = ""
    organization_id: str = ""


@dataclass
class BudgetConfig:
    """Budget limits for AI operations."""
    max_cost_per_operation: float = {MAX_COST_PER_ANALYSIS}
    max_cost_per_user_daily: float = 5.00
    max_cost_per_org_daily: float = 50.00
    max_cost_per_org_monthly: float = 500.00
    alert_threshold: float = 0.8  # Alert at 80% of budget


class CostTracker:
    """Track AI operation costs and enforce budgets.

    Features:
    - Per-operation cost tracking
    - Per-user daily limits
    - Per-organization daily/monthly limits
    - Budget alerts at configurable thresholds
    - Cost estimation before execution
    """

    def __init__(self, budget: Optional[BudgetConfig] = None):
        self.budget = budget or BudgetConfig()
        self.records: list[UsageRecord] = []

    def estimate_cost(self, model: str, est_input_tokens: int, est_output_tokens: int) -> float:
        """Estimate cost before executing an AI operation."""
        for pattern, costs in COST_TABLE.items():
            if pattern.endswith("/*"):
                if model.startswith(pattern[:-2]):
                    return (
                        est_input_tokens * costs["input"] / 1_000_000
                        + est_output_tokens * costs["output"] / 1_000_000
                    )
            elif pattern in model:
                return (
                    est_input_tokens * costs["input"] / 1_000_000
                    + est_output_tokens * costs["output"] / 1_000_000
                )
        return 0.0

    def check_budget(self, user_id: str, organization_id: str, estimated_cost: float) -> tuple[bool, str]:
        """Check if an operation is within budget limits.

        Returns:
            (allowed, reason) - True if within budget, False with explanation if not
        """
        # Per-operation limit
        if estimated_cost > self.budget.max_cost_per_operation:
            return False, f"Estimated cost ${estimated_cost:.4f} exceeds per-operation limit ${self.budget.max_cost_per_operation}"

        # User daily limit
        user_daily = self._get_user_daily_cost(user_id)
        if user_daily + estimated_cost > self.budget.max_cost_per_user_daily:
            return False, f"User daily limit reached: ${user_daily:.2f} / ${self.budget.max_cost_per_user_daily}"

        # Org daily limit
        org_daily = self._get_org_daily_cost(organization_id)
        if org_daily + estimated_cost > self.budget.max_cost_per_org_daily:
            return False, f"Organization daily limit reached: ${org_daily:.2f} / ${self.budget.max_cost_per_org_daily}"

        return True, "Within budget"

    def record_usage(self, record: UsageRecord) -> None:
        """Record an AI operation's actual cost."""
        self.records.append(record)

        # Check alert threshold
        org_daily = self._get_org_daily_cost(record.organization_id)
        threshold = self.budget.max_cost_per_org_daily * self.budget.alert_threshold
        if org_daily >= threshold:
            logger.warning(
                f"AI cost alert: org {record.organization_id} at "
                f"${org_daily:.2f} ({org_daily / self.budget.max_cost_per_org_daily * 100:.0f}% of daily budget)"
            )

    def get_summary(self, organization_id: str = "", period_days: int = 30) -> dict:
        """Get cost summary for dashboard display."""
        cutoff = datetime.utcnow() - timedelta(days=period_days)
        relevant = [
            r for r in self.records
            if r.timestamp >= cutoff
            and (not organization_id or r.organization_id == organization_id)
        ]

        total_cost = sum(r.cost for r in relevant)
        by_provider = {}
        by_operation = {}
        for r in relevant:
            by_provider[r.provider] = by_provider.get(r.provider, 0) + r.cost
            by_operation[r.operation] = by_operation.get(r.operation, 0) + r.cost

        return {
            "total_cost": round(total_cost, 4),
            "total_operations": len(relevant),
            "total_tokens": sum(r.input_tokens + r.output_tokens for r in relevant),
            "by_provider": by_provider,
            "by_operation": by_operation,
            "period_days": period_days,
        }

    def _get_user_daily_cost(self, user_id: str) -> float:
        today = datetime.utcnow().date()
        return sum(
            r.cost for r in self.records
            if r.user_id == user_id and r.timestamp.date() == today
        )

    def _get_org_daily_cost(self, org_id: str) -> float:
        today = datetime.utcnow().date()
        return sum(
            r.cost for r in self.records
            if r.organization_id == org_id and r.timestamp.date() == today
        )
```

> **AuditGH Reference:** Production cost tracking is embedded in each provider via `estimate_cost()`, `get_total_cost()`, and `get_total_tokens()` methods. The `ReasoningEngine` enforces `max_cost_per_analysis: 0.50` per zero-day investigation.

---

## 15. Failover & Resilience

### 15.1 Multi-Level Failover Chain

```python
# src/ai_agent/resilience.py
"""Multi-level failover and resilience patterns for AI operations."""

import asyncio
import time
from dataclasses import dataclass
from typing import Optional
from loguru import logger
from src.ai_agent.providers.base import AIProvider, AIResponse


@dataclass
class CircuitBreakerState:
    """Circuit breaker state for a provider."""
    failures: int = 0
    last_failure: float = 0
    is_open: bool = False
    half_open_after: float = 60.0  # seconds
    failure_threshold: int = 3


class CircuitBreaker:
    """Circuit breaker pattern for AI provider calls.

    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Provider is down, requests fail fast (no API call)
    - HALF-OPEN: After cooldown, allow one test request
    """

    def __init__(self, failure_threshold: int = 3, cooldown_seconds: float = 60.0):
        self.state = CircuitBreakerState(
            failure_threshold=failure_threshold,
            half_open_after=cooldown_seconds,
        )

    def can_execute(self) -> bool:
        """Check if the circuit allows a request."""
        if not self.state.is_open:
            return True
        # Check if cooldown has elapsed (half-open)
        elapsed = time.time() - self.state.last_failure
        if elapsed >= self.state.half_open_after:
            return True
        return False

    def record_success(self) -> None:
        """Record a successful call — reset circuit."""
        self.state.failures = 0
        self.state.is_open = False

    def record_failure(self) -> None:
        """Record a failure — potentially open circuit."""
        self.state.failures += 1
        self.state.last_failure = time.time()
        if self.state.failures >= self.state.failure_threshold:
            self.state.is_open = True
            logger.warning(f"Circuit breaker OPEN after {self.state.failures} failures")


class ResilientProvider:
    """Provider wrapper with circuit breaker, retry, and multi-level failover.

    Failover chain:
    1. Primary provider (e.g., Claude via Azure Foundry)
    2. Secondary provider (e.g., OpenAI GPT-4o)
    3. Local fallback (e.g., Ollama)
    4. Cached results (if available)
    5. Graceful error with explanation
    """

    def __init__(
        self,
        providers: list[AIProvider],
        max_retries: int = {MAX_RETRIES},
        retry_delay: float = 1.0,
    ):
        self.providers = providers
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.breakers = {
            id(p): CircuitBreaker() for p in providers
        }

    async def generate(self, messages, system="", tools=None, **kwargs) -> AIResponse:
        """Try each provider in order with circuit breaking and retry."""
        last_error = None

        for provider in self.providers:
            breaker = self.breakers[id(provider)]

            if not breaker.can_execute():
                logger.debug(f"Skipping {provider.config.provider_type} (circuit open)")
                continue

            for attempt in range(self.max_retries):
                try:
                    response = await provider.generate(
                        messages, system, tools, **kwargs
                    )
                    breaker.record_success()
                    return response

                except Exception as e:
                    last_error = e
                    breaker.record_failure()
                    logger.warning(
                        f"Provider {provider.config.provider_type} attempt "
                        f"{attempt + 1}/{self.max_retries} failed: {e}"
                    )
                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(self.retry_delay * (2 ** attempt))

        # All providers failed
        raise RuntimeError(
            f"All {len(self.providers)} providers failed. Last error: {last_error}"
        )
```

### 15.2 Graceful Degradation

```python
# Degradation levels
async def analyze_with_degradation(
    query: str,
    providers: list[AIProvider],
    cache: Optional[dict] = None,
) -> dict:
    """Attempt analysis with graceful degradation.

    Levels:
    1. Full AI analysis (primary provider)
    2. Reduced AI analysis (fallback provider, simpler prompt)
    3. Cached results (if similar query was analyzed before)
    4. Rule-based analysis (no AI, pattern matching only)
    5. Graceful error (explain what happened, suggest retry)
    """
    # Level 1: Full analysis
    resilient = ResilientProvider(providers)
    try:
        response = await resilient.generate(
            messages=[{"role": "user", "content": query}],
            system="You are an expert analyst.",
        )
        return {"level": "full_ai", "content": response.content, "degraded": False}
    except RuntimeError:
        pass

    # Level 2: Cached results
    if cache:
        cached = _find_similar_cached(query, cache)
        if cached:
            return {
                "level": "cached",
                "content": cached["content"],
                "degraded": True,
                "note": f"Using cached result from {cached['timestamp']} (AI providers unavailable)",
            }

    # Level 3: Rule-based fallback
    rule_result = _rule_based_analysis(query)
    if rule_result:
        return {
            "level": "rule_based",
            "content": rule_result,
            "degraded": True,
            "note": "AI providers unavailable. Using rule-based analysis.",
        }

    # Level 4: Graceful error
    return {
        "level": "error",
        "content": "AI analysis is temporarily unavailable. Please try again later.",
        "degraded": True,
        "error": "All AI providers unreachable",
    }
```

> **AuditGH Reference:** Production uses `FailoverProvider` wrapping the primary Claude/Azure Foundry provider with Docker AI (`ai/qwen3`) as fallback. The DOE self-annealing in `claude.py` automatically corrects model names when Azure AI Foundry deployments are updated, preventing configuration drift failures.

---

## 16. Security & Safety Guardrails

### 16.1 Input Sanitization (Prompt Injection Prevention)

```python
# src/ai_agent/security.py
"""Security guardrails for AI operations."""

import re
from typing import Optional
from loguru import logger


class PromptGuard:
    """Protect against prompt injection and unsafe inputs.

    Checks:
    - Known prompt injection patterns
    - Excessive length
    - Encoded payloads (base64, hex)
    - System prompt override attempts
    """

    # Known injection patterns
    INJECTION_PATTERNS = [
        r"ignore\s+(all\s+)?previous\s+instructions",
        r"ignore\s+(all\s+)?above",
        r"you\s+are\s+now\s+a",
        r"new\s+instructions?\s*:",
        r"system\s*:\s*",
        r"<\|system\|>",
        r"<\|im_start\|>system",
        r"```system",
        r"ADMIN\s+OVERRIDE",
        r"sudo\s+mode",
    ]

    def __init__(self, max_input_length: int = 50_000):
        self.max_input_length = max_input_length
        self._patterns = [re.compile(p, re.IGNORECASE) for p in self.INJECTION_PATTERNS]

    def sanitize(self, user_input: str) -> tuple[str, list[str]]:
        """Sanitize user input and return (cleaned, warnings).

        Returns:
            (sanitized_input, list of warning messages)
        """
        warnings = []

        # Length check
        if len(user_input) > self.max_input_length:
            user_input = user_input[: self.max_input_length]
            warnings.append(f"Input truncated to {self.max_input_length} chars")

        # Check for injection patterns
        for pattern in self._patterns:
            if pattern.search(user_input):
                warnings.append(f"Potential prompt injection detected: {pattern.pattern}")
                logger.warning(f"Prompt injection attempt detected: {pattern.pattern}")
                # Don't remove — flag for review but allow (defense in depth via system prompt)

        return user_input, warnings


class OutputValidator:
    """Validate AI outputs before returning to users.

    Checks:
    - JSON structure matches expected schema
    - No sensitive data leakage (API keys, passwords)
    - Content within expected bounds
    """

    SENSITIVE_PATTERNS = [
        r"(sk-[a-zA-Z0-9]{20,})",          # OpenAI API keys
        r"(AKIA[A-Z0-9]{16})",              # AWS access keys
        r"(ghp_[a-zA-Z0-9]{36})",           # GitHub tokens
        r"(password\s*[:=]\s*['\"][^'\"]+)", # Password assignments
        r"(-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----)", # Private keys
    ]

    def __init__(self):
        self._patterns = [re.compile(p) for p in self.SENSITIVE_PATTERNS]

    def validate(self, output: str) -> tuple[str, list[str]]:
        """Validate and clean AI output.

        Returns:
            (cleaned_output, list of redaction messages)
        """
        redactions = []
        cleaned = output

        for pattern in self._patterns:
            matches = pattern.findall(cleaned)
            for match in matches:
                match_str = match if isinstance(match, str) else match[0]
                cleaned = cleaned.replace(match_str, "[REDACTED]")
                redactions.append(f"Redacted potential secret: {pattern.pattern}")
                logger.warning(f"AI output contained sensitive data, redacted: {pattern.pattern}")

        return cleaned, redactions
```

### 16.2 RBAC Integration for AI Access

```python
# src/ai_agent/security.py (continued)

# AI operation permissions by role
AI_PERMISSIONS = {
    "user": ["triage", "analyze_finding"],
    "analyst": ["triage", "analyze_finding", "remediation", "component_analysis"],
    "manager": ["triage", "analyze_finding", "remediation", "component_analysis", "architecture"],
    "admin": ["triage", "analyze_finding", "remediation", "component_analysis", "architecture", "zero_day"],
    "super_admin": ["*"],  # All operations
}


def check_ai_permission(user_role: str, operation: str) -> bool:
    """Check if a user's role permits an AI operation."""
    allowed = AI_PERMISSIONS.get(user_role, [])
    return "*" in allowed or operation in allowed


# Rate limiting for AI operations
from collections import defaultdict
from datetime import datetime, timedelta


class AIRateLimiter:
    """Rate limit AI operations per user to prevent abuse."""

    def __init__(
        self,
        max_per_minute: int = 10,
        max_per_hour: int = 100,
        max_per_day: int = 500,
    ):
        self.max_per_minute = max_per_minute
        self.max_per_hour = max_per_hour
        self.max_per_day = max_per_day
        self._requests: dict[str, list[datetime]] = defaultdict(list)

    def check(self, user_id: str) -> tuple[bool, str]:
        """Check if user is within rate limits."""
        now = datetime.utcnow()
        timestamps = self._requests[user_id]

        # Clean old entries
        timestamps[:] = [t for t in timestamps if (now - t).total_seconds() < 86400]

        minute_count = sum(1 for t in timestamps if (now - t).total_seconds() < 60)
        hour_count = sum(1 for t in timestamps if (now - t).total_seconds() < 3600)
        day_count = len(timestamps)

        if minute_count >= self.max_per_minute:
            return False, f"Rate limit: {self.max_per_minute}/minute exceeded"
        if hour_count >= self.max_per_hour:
            return False, f"Rate limit: {self.max_per_hour}/hour exceeded"
        if day_count >= self.max_per_day:
            return False, f"Rate limit: {self.max_per_day}/day exceeded"

        timestamps.append(now)
        return True, "OK"
```

### 16.3 Allowed Actions Whitelist

```python
# src/ai_agent/remediation.py (safety controls)
"""Safety controls for AI-generated remediations."""

from enum import Enum


class SafetyLevel(str, Enum):
    SAFE = "safe"          # Read-only, no side effects
    MODERATE = "moderate"  # Writes to database, modifiable
    RISKY = "risky"        # Infrastructure changes, irreversible


# Whitelist of actions AI agents can recommend/execute
ALLOWED_ACTIONS = {
    "INCREASE_TIMEOUT": SafetyLevel.SAFE,
    "EXCLUDE_PATTERNS": SafetyLevel.SAFE,
    "SKIP_SCANNER": SafetyLevel.MODERATE,
    "MODIFY_CONFIG": SafetyLevel.MODERATE,
    "RESTART_SCAN": SafetyLevel.MODERATE,
    "APPLY_PATCH": SafetyLevel.RISKY,
    "UPDATE_DEPENDENCY": SafetyLevel.RISKY,
}


def validate_remediation_action(action: str, auto_apply: bool = False) -> tuple[bool, str]:
    """Check if an AI-recommended action is allowed.

    Args:
        action: Action name
        auto_apply: If True, only SAFE actions are auto-approved

    Returns:
        (allowed, reason)
    """
    if action not in ALLOWED_ACTIONS:
        return False, f"Action '{action}' not in whitelist"

    safety = ALLOWED_ACTIONS[action]

    if auto_apply and safety != SafetyLevel.SAFE:
        return False, f"Action '{action}' is {safety.value} — requires human approval"

    return True, f"Action '{action}' allowed (safety: {safety.value})"
```

> **AuditGH Reference:** Production remediation engine at `src/ai_agent/remediation.py` uses an `allowed_actions` whitelist, `min_confidence: 0.7` threshold, and `safety_level` enforcement. All AI remediations require human approval before application.

---

## 17. Monitoring, Logging & Observability

### 17.1 Structured AI Logging

```python
# Logging patterns for AI operations
from loguru import logger


# Bind context for all AI-related logs
ai_logger = logger.bind(module="ai_agent")


# Log patterns used throughout the AI layer:

# Provider call
ai_logger.bind(
    provider="claude",
    model="{AI_PRIMARY_MODEL}",
    operation="triage",
).info("AI call started")

# Tool execution
ai_logger.bind(
    tool="search_findings",
    args={"query": "log4j", "severity": "critical"},
).info("Tool executed, returned 5 results")

# Cost tracking
ai_logger.bind(
    provider="claude",
    input_tokens=1500,
    output_tokens=800,
    cost=0.0165,
).info("AI call completed")

# Failover event
ai_logger.bind(
    primary="anthropic_foundry",
    fallback="ollama",
    error="ConnectionTimeout",
).warning("Provider failover triggered")

# Security event
ai_logger.bind(
    event="prompt_injection_detected",
    pattern="ignore previous instructions",
    user_id="user-123",
).warning("Prompt injection attempt blocked")
```

### 17.2 Prometheus Metrics

```python
# src/ai_agent/metrics.py
"""Prometheus metrics for AI operations."""

from prometheus_client import Counter, Histogram, Gauge


# Request metrics
AI_REQUESTS_TOTAL = Counter(
    "ai_requests_total",
    "Total AI operations",
    ["provider", "model", "operation", "status"],
)

AI_REQUEST_DURATION = Histogram(
    "ai_request_duration_seconds",
    "AI operation latency",
    ["provider", "operation"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
)

# Token metrics
AI_TOKENS_USED = Counter(
    "ai_tokens_total",
    "Total tokens consumed",
    ["provider", "direction"],  # direction: input/output
)

# Cost metrics
AI_COST_TOTAL = Counter(
    "ai_cost_usd_total",
    "Total AI cost in USD",
    ["provider", "operation"],
)

AI_COST_PER_OPERATION = Histogram(
    "ai_cost_per_operation_usd",
    "Cost per AI operation in USD",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.10, 0.25, 0.50, 1.00],
)

# Provider health
AI_PROVIDER_HEALTH = Gauge(
    "ai_provider_healthy",
    "Whether a provider is healthy (1) or not (0)",
    ["provider"],
)

AI_FAILOVER_TOTAL = Counter(
    "ai_failover_total",
    "Number of failover events",
    ["from_provider", "to_provider"],
)

# Tool metrics
AI_TOOL_CALLS = Counter(
    "ai_tool_calls_total",
    "Total tool invocations by AI agents",
    ["tool_name", "status"],
)

AI_TOOL_DURATION = Histogram(
    "ai_tool_duration_seconds",
    "Tool execution latency",
    ["tool_name"],
)

# Conversation metrics
AI_CONVERSATIONS_ACTIVE = Gauge(
    "ai_conversations_active",
    "Number of active AI conversations",
)

AI_MESSAGES_TOTAL = Counter(
    "ai_messages_total",
    "Total AI messages",
    ["role"],  # user, assistant, system
)
```

### 17.3 OpenTelemetry Tracing

```python
# src/ai_agent/tracing.py
"""OpenTelemetry tracing for AI operations."""

from opentelemetry import trace
from opentelemetry.trace import StatusCode
from functools import wraps

tracer = trace.get_tracer("ai_agent")


def trace_ai_operation(operation_name: str):
    """Decorator to add OpenTelemetry tracing to AI operations."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with tracer.start_as_current_span(
                f"ai.{operation_name}",
                attributes={
                    "ai.operation": operation_name,
                    "ai.provider": kwargs.get("provider", "unknown"),
                },
            ) as span:
                try:
                    result = await func(*args, **kwargs)
                    if hasattr(result, "total_tokens"):
                        span.set_attribute("ai.tokens.total", result.total_tokens)
                        span.set_attribute("ai.cost", result.cost)
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as e:
                    span.set_status(StatusCode.ERROR, str(e))
                    span.record_exception(e)
                    raise
        return wrapper
    return decorator


# Usage:
# @trace_ai_operation("triage")
# async def triage_finding(provider, finding_data):
#     ...
```

---

## 18. Database Models for AI

### 18.1 SQLAlchemy Models

```python
# Add to src/api/models.py (AI-related models)
"""Database models for AI conversations, analysis, and tracking."""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Integer, Float, Boolean, DateTime,
    ForeignKey, JSON, Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from src.api.database import Base
import enum


class AIConversation(Base):
    """Multi-turn AI conversation."""
    __tablename__ = "ai_conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(String(36), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    focus = Column(String(50), default="general")  # security, architecture, etc.
    project_id = Column(String(36), nullable=True)
    repository_id = Column(UUID(as_uuid=True), ForeignKey("{TENANT_ENTITY.lower()}s.id"), nullable=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    message_count = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    total_cost = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship("AIMessage", back_populates="conversation", cascade="all, delete-orphan")


class MessageRole(str, enum.Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    SYSTEM = "SYSTEM"


class AIMessage(Base):
    """Individual message in an AI conversation."""
    __tablename__ = "ai_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("ai_conversations.id"), nullable=False)
    role = Column(SQLEnum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    thinking = Column(Text, default="")  # Chain-of-thought / extended thinking
    context_used = Column(JSON, default={})  # What context was provided
    tokens_used = Column(Integer, default=0)
    confidence_score = Column(Float, nullable=True)
    web_search_performed = Column(Boolean, default=False)
    provider = Column(String(50), default="")
    model = Column(String(100), default="")
    cost = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("AIConversation", back_populates="messages")
    citations = relationship("AICitation", back_populates="message", cascade="all, delete-orphan")


class CitationType(str, enum.Enum):
    REPOSITORY = "REPOSITORY"
    SCAN_RESULT = "SCAN_RESULT"
    VULNERABILITY = "VULNERABILITY"
    WEB = "WEB"
    DOCUMENTATION = "DOCUMENTATION"


class AICitation(Base):
    """Source citation referenced by an AI message."""
    __tablename__ = "ai_citations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(UUID(as_uuid=True), ForeignKey("ai_messages.id"), nullable=False)
    type = Column(SQLEnum(CitationType), nullable=False)
    source = Column(String(255), nullable=False)  # e.g., "Repository: org/repo"
    reference = Column(String(255), default="")    # e.g., finding ID
    excerpt = Column(Text, default="")              # Relevant quote
    url = Column(String(500), default="")
    relevance_score = Column(Float, default=0.5)
    created_at = Column(DateTime, default=datetime.utcnow)

    message = relationship("AIMessage", back_populates="citations")


class ComponentAnalysis(Base):
    """Cached AI analysis of a software component/package."""
    __tablename__ = "component_analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    package_name = Column(String(255), nullable=False)
    version = Column(String(50), nullable=False)
    package_manager = Column(String(50), nullable=False)
    analysis_text = Column(Text, default="")
    vulnerability_summary = Column(Text, default="")
    severity = Column(String(20), default="")
    exploitability = Column(String(50), default="")
    fixed_version = Column(String(50), default="")
    provider = Column(String(50), default="")
    model = Column(String(100), default="")
    tokens_used = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        # Cache key: unique per package+version+manager
        {"schema": None},
    )


class Remediation(Base):
    """AI-generated remediation for a finding."""
    __tablename__ = "remediations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    finding_id = Column(UUID(as_uuid=True), ForeignKey("findings.id"), nullable=False)
    remediation_text = Column(Text, nullable=False)
    diff = Column(Text, default="")  # Unified diff of the fix
    confidence = Column(Float, default=0.0)
    provider = Column(String(50), default="")
    model = Column(String(100), default="")
    tokens_used = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    applied = Column(Boolean, default=False)  # Has user applied this fix?
    applied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AIProviderUsage(Base):
    """Daily aggregated AI provider usage for cost tracking."""
    __tablename__ = "ai_provider_usage"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date = Column(DateTime, nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)
    provider = Column(String(50), nullable=False)
    model = Column(String(100), nullable=False)
    operation = Column(String(50), nullable=False)
    call_count = Column(Integer, default=0)
    total_input_tokens = Column(Integer, default=0)
    total_output_tokens = Column(Integer, default=0)
    total_cost = Column(Float, default=0.0)
    error_count = Column(Integer, default=0)
    avg_latency_ms = Column(Float, default=0.0)


class SkillExecution(Base):
    """Record of a skill invocation."""
    __tablename__ = "skill_executions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    skill_name = Column(String(100), nullable=False)
    skill_version = Column(String(20), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)
    input_summary = Column(Text, default="")
    output_summary = Column(Text, default="")
    success = Column(Boolean, default=True)
    error = Column(Text, default="")
    tokens_used = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    duration_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
```

### 18.2 Alembic Migration

```python
# migrations/versions/xxx_add_ai_models.py
"""Add AI conversation, citation, analysis, and cost tracking models.

Revision ID: {auto-generated}
Create Date: {auto-generated}
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    op.create_table(
        "ai_conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", sa.String(36), unique=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("focus", sa.String(50), default="general"),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("message_count", sa.Integer, default=0),
        sa.Column("total_tokens", sa.Integer, default=0),
        sa.Column("total_cost", sa.Float, default=0.0),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )
    op.create_index("ix_ai_conversations_org", "ai_conversations", ["organization_id"])
    op.create_index("ix_ai_conversations_user", "ai_conversations", ["user_id"])

    op.create_table(
        "ai_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("ai_conversations.id")),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("thinking", sa.Text, default=""),
        sa.Column("context_used", sa.JSON, default={}),
        sa.Column("tokens_used", sa.Integer, default=0),
        sa.Column("provider", sa.String(50)),
        sa.Column("model", sa.String(100)),
        sa.Column("cost", sa.Float, default=0.0),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_ai_messages_conversation", "ai_messages", ["conversation_id"])

    op.create_table(
        "ai_citations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("message_id", UUID(as_uuid=True), sa.ForeignKey("ai_messages.id")),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("source", sa.String(255), nullable=False),
        sa.Column("reference", sa.String(255)),
        sa.Column("excerpt", sa.Text),
        sa.Column("url", sa.String(500)),
        sa.Column("relevance_score", sa.Float, default=0.5),
        sa.Column("created_at", sa.DateTime),
    )

    op.create_table(
        "component_analyses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("package_name", sa.String(255), nullable=False),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("package_manager", sa.String(50), nullable=False),
        sa.Column("analysis_text", sa.Text),
        sa.Column("vulnerability_summary", sa.Text),
        sa.Column("severity", sa.String(20)),
        sa.Column("fixed_version", sa.String(50)),
        sa.Column("tokens_used", sa.Integer, default=0),
        sa.Column("cost", sa.Float, default=0.0),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index(
        "ix_component_cache",
        "component_analyses",
        ["package_name", "version", "package_manager"],
        unique=True,
    )

    op.create_table(
        "ai_provider_usage",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("date", sa.DateTime, nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id")),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("operation", sa.String(50), nullable=False),
        sa.Column("call_count", sa.Integer, default=0),
        sa.Column("total_input_tokens", sa.Integer, default=0),
        sa.Column("total_output_tokens", sa.Integer, default=0),
        sa.Column("total_cost", sa.Float, default=0.0),
        sa.Column("error_count", sa.Integer, default=0),
    )
    op.create_index("ix_provider_usage_date_org", "ai_provider_usage", ["date", "organization_id"])

    op.create_table(
        "skill_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("skill_name", sa.String(100), nullable=False),
        sa.Column("skill_version", sa.String(20), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id")),
        sa.Column("success", sa.Boolean, default=True),
        sa.Column("tokens_used", sa.Integer, default=0),
        sa.Column("cost", sa.Float, default=0.0),
        sa.Column("duration_ms", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime),
    )


def downgrade():
    op.drop_table("skill_executions")
    op.drop_table("ai_provider_usage")
    op.drop_table("component_analyses")
    op.drop_table("ai_citations")
    op.drop_table("ai_messages")
    op.drop_table("ai_conversations")
```

> **AuditGH Reference:** Production models `AIConversation`, `AIMessage`, `AICitation`, `ComponentAnalysis`, and `Remediation` in `src/api/models.py` store conversation history, analysis results, and AI-generated remediations. The `ComponentAnalysis` table caches results with a unique constraint on `(package_name, version, package_manager)` to avoid re-analyzing the same component.

---

## 19. API Endpoints for AI

### 19.1 FastAPI Router

```python
# src/api/routers/ai.py
"""AI-powered analysis endpoints for {PROJECT_NAME}."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from loguru import logger
from src.auth.dependencies import get_current_user
from src.rbac.dependencies import require_permission
from src.api.database import get_db
from src.ai_agent.providers import get_provider
from src.ai_agent.tools import create_default_tool_registry
from src.ai_agent.skills.registry import create_default_registry
from src.ai_agent.reasoning import ReasoningEngine
from src.ai_agent.security import PromptGuard, OutputValidator, check_ai_permission, AIRateLimiter
from src.ai_agent.cost import CostTracker, UsageRecord
from datetime import datetime

router = APIRouter(prefix="/ai", tags=["ai"])

# Initialize at module level
provider = get_provider()
tool_registry = create_default_tool_registry()
skills_registry = create_default_registry()
prompt_guard = PromptGuard()
output_validator = OutputValidator()
rate_limiter = AIRateLimiter()
cost_tracker = CostTracker()


# ── Request/Response Models ──

class TriageRequest(BaseModel):
    title: str = Field(..., description="Finding title")
    description: str = Field("", description="Finding description")
    severity: str = Field("", description="Reported severity")
    scanner: str = Field("", description="Scanner that detected it")

class TriageResponse(BaseModel):
    priority: str
    confidence: float
    false_positive_probability: float = 0.0
    reasoning: str
    recommended_action: str

class RemediationRequest(BaseModel):
    vuln_type: str = Field(..., description="Vulnerability type")
    language: str = Field(..., description="Programming language")
    context: str = Field("", description="Code context")
    description: str = Field("", description="Vulnerability description")

class RemediationResponse(BaseModel):
    remediation_text: str
    diff: str = ""
    confidence: float = 0.0
    testing_notes: str = ""

class ZeroDayRequest(BaseModel):
    query: str = Field(..., description="Natural language query")
    scopes: list[str] = Field(default=["findings", "dependencies"])

class ZeroDayResponse(BaseModel):
    answer: str
    affected_repositories: list[str] = []
    plan: list[dict] = []
    execution_summary: dict = {}
    cost: float = 0.0

class SkillInvokeRequest(BaseModel):
    skill_name: str = Field(..., description="Skill to invoke")
    version: str = Field("latest", description="Skill version")
    params: dict = Field(default={}, description="Skill-specific parameters")

class AIConfigResponse(BaseModel):
    provider: str
    model: str
    available_skills: list[dict]
    available_tools: list[str]


# ── Endpoints ──

@router.get("/config", response_model=AIConfigResponse)
async def get_ai_config(current_user=Depends(get_current_user)):
    """Get current AI provider configuration and available capabilities."""
    return AIConfigResponse(
        provider=provider.config.provider_type.value if hasattr(provider, 'config') else "failover",
        model=provider.config.model if hasattr(provider, 'config') else "multi",
        available_skills=skills_registry.list_skills(),
        available_tools=[t["name"] for t in tool_registry.get_definitions()],
    )


@router.post("/triage", response_model=TriageResponse)
async def triage_finding(
    request: TriageRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """AI-powered finding triage and prioritization."""
    # Rate limit
    allowed, reason = rate_limiter.check(str(current_user.id))
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)

    # Permission check
    if not check_ai_permission(current_user.role, "triage"):
        raise HTTPException(status_code=403, detail="Insufficient permissions for AI triage")

    # Sanitize input
    sanitized, warnings = prompt_guard.sanitize(request.description)

    # Execute skill
    result = await skills_registry.invoke(
        "triage",
        context={"provider": provider, "db": db},
        finding={
            "title": request.title,
            "description": sanitized,
            "severity": request.severity,
            "scanner": request.scanner,
        },
    )

    # Validate output
    output, redactions = output_validator.validate(str(result.get("output", "")))

    return result["output"] if isinstance(result["output"], dict) else {"priority": "P2", "confidence": 0.5, "reasoning": output, "recommended_action": "investigate"}


@router.post("/remediate", response_model=RemediationResponse)
async def generate_remediation(
    request: RemediationRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Generate AI-powered remediation code for a vulnerability."""
    allowed, reason = rate_limiter.check(str(current_user.id))
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)

    if not check_ai_permission(current_user.role, "remediation"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    result = await skills_registry.invoke(
        "remediation",
        context={"provider": provider, "db": db},
        vuln_type=request.vuln_type,
        language=request.language,
        context=request.context,
    )

    return RemediationResponse(
        remediation_text=result.get("output", ""),
        confidence=result.get("confidence", 0.0),
    )


@router.post("/zero-day", response_model=ZeroDayResponse)
async def analyze_zero_day(
    request: ZeroDayRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Zero-day vulnerability investigation with tool use."""
    if not check_ai_permission(current_user.role, "zero_day"):
        raise HTTPException(status_code=403, detail="Insufficient permissions for zero-day analysis")

    # Budget check
    estimated_cost = cost_tracker.estimate_cost("{AI_PRIMARY_MODEL}", 5000, 3000)
    allowed, reason = cost_tracker.check_budget(
        str(current_user.id), str(current_user.organization_id), estimated_cost
    )
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)

    engine = ReasoningEngine(
        provider=provider,
        tool_registry=tool_registry,
        max_cost_per_analysis=0.50,
    )

    result = await engine.analyze(
        query=request.query,
        context={"organization_id": str(current_user.organization_id)},
    )

    # Record cost
    cost_tracker.record_usage(UsageRecord(
        timestamp=datetime.utcnow(),
        provider="{AI_PRIMARY_PROVIDER}",
        model="{AI_PRIMARY_MODEL}",
        operation="zero_day",
        input_tokens=result.total_tokens // 2,
        output_tokens=result.total_tokens // 2,
        cost=result.total_cost,
        user_id=str(current_user.id),
    ))

    return ZeroDayResponse(
        answer=result.answer,
        plan=result.plan,
        execution_summary={"iterations": result.iterations, "tool_calls": len(result.tool_executions)},
        cost=result.total_cost,
    )


@router.post("/skills/invoke")
async def invoke_skill(
    request: SkillInvokeRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Invoke a registered AI skill by name."""
    result = await skills_registry.invoke(
        request.skill_name,
        context={"provider": provider, "db": db, "user": current_user},
        version=request.version,
        **request.params,
    )
    return result


@router.get("/skills")
async def list_skills(current_user=Depends(get_current_user)):
    """List all available AI skills."""
    return {"skills": skills_registry.list_skills()}


@router.get("/cost/summary")
async def get_cost_summary(
    period_days: int = 30,
    current_user=Depends(get_current_user),
):
    """Get AI cost summary for the current organization."""
    return cost_tracker.get_summary(
        organization_id=str(current_user.organization_id),
        period_days=period_days,
    )
```

> **AuditGH Reference:** The production AI router at `src/api/routers/ai.py` (2,707 lines) includes 14+ endpoints: `/ai/config`, `/ai/remediate`, `/ai/triage`, `/ai/analyze-finding`, `/ai/analyze-component`, `/ai/zero-day`, `/ai/architecture`, `/ai/export/zda-pdf`, `/ai/export/zda-docx`, and more. All endpoints integrate with RBAC (`require_permission`) and multi-tenant scoping (`get_tenant_db()`).

---

## 20. Validation Checklist

### Provider Layer
- [ ] Abstract `AIProvider` base class implemented with all required methods
- [ ] Claude provider configured with API key and model
- [ ] OpenAI provider configured with API key and model
- [ ] Ollama provider configured with base URL and model
- [ ] At least one cloud provider + one local fallback configured
- [ ] DOE self-annealing enabled for cloud providers
- [ ] Cost estimation methods return accurate values per provider
- [ ] Provider health check endpoint returns accurate status
- [ ] All providers handle timeout and connection errors gracefully

### Agent Frameworks
- [ ] Claude Agent SDK installed and basic agent functional
- [ ] LangGraph installed and React agent functional (if using)
- [ ] Raw API agent loop handles tool use correctly
- [ ] Agent timeout configured (`{AGENT_TIMEOUT_SECONDS}` seconds)
- [ ] Agent max iterations prevents infinite loops
- [ ] Agent responses are validated before returning to user

### Sub-Agent Orchestration
- [ ] Supervisor pattern: delegates to workers, collects results, synthesizes
- [ ] Pipeline pattern: stages execute sequentially with context enrichment
- [ ] Swarm pattern: agents hand off dynamically based on context
- [ ] Handoff count limited to prevent infinite loops
- [ ] Failed workers don't crash the entire orchestration
- [ ] Cost tracked across all sub-agents in an orchestration

### MCP Server
- [ ] FastMCP server exposes all domain tools (`search_*`, `analyze_*`)
- [ ] Resources expose read-only data (`finding://`, `repository://`)
- [ ] Prompts defined for common analysis templates
- [ ] Server runs on configured port (`{MCP_SERVER_PORT}`)
- [ ] Authentication configured for production
- [ ] Tool schemas include complete descriptions and parameter types
- [ ] Server responds to health checks

### MCP Client
- [ ] Client connects to at least one external MCP server
- [ ] Tool discovery lists all available tools
- [ ] Tool invocation returns expected results
- [ ] Connection errors handled with retry
- [ ] Disconnection cleanup releases resources

### Skills Registry
- [ ] Built-in skills registered (triage, remediation, zero_day)
- [ ] Skills discoverable via API (`GET /ai/skills`)
- [ ] Skill invocation works via API (`POST /ai/skills/invoke`)
- [ ] Skill versioning supports multiple versions
- [ ] Custom skills can be registered at runtime
- [ ] Skill execution records persisted to database

### Tool Definitions
- [ ] All database tools defined with proper JSON Schema
- [ ] Tool executor validates required parameters
- [ ] Tool results formatted as JSON strings
- [ ] Parallel tool execution works correctly
- [ ] Tool errors return structured error responses (not exceptions)
- [ ] Multi-tenant scoping applied to all database tools

### Prompt Engineering
- [ ] System prompts defined for each agent role
- [ ] JSON output enforcement works (structured output or extraction)
- [ ] Context window management truncates long inputs
- [ ] Conversation history trimming preserves recent + system messages
- [ ] Prompt injection patterns detected and flagged

### Analysis Pipeline
- [ ] ReasoningEngine executes plan → execute → synthesize loop
- [ ] Tool use loop terminates on final text response
- [ ] Cost budget enforced mid-analysis
- [ ] Analysis results persisted to database
- [ ] Zero-day investigation completes with tool executions

### Conversations
- [ ] Conversations created and persisted
- [ ] Messages added with role, content, tokens, cost
- [ ] Citations tracked with type and relevance score
- [ ] Conversation history retrieved for multi-turn
- [ ] Old messages summarized when context window fills

### Cost Tracking
- [ ] Per-operation costs recorded
- [ ] User daily limits enforced
- [ ] Organization daily/monthly limits enforced
- [ ] Cost summary API returns accurate data
- [ ] Budget alerts fire at configured threshold (80%)
- [ ] Free providers (Ollama, Docker) report $0.00 cost

### Failover & Resilience
- [ ] FailoverProvider tries primary then fallback
- [ ] Circuit breaker opens after configured failures
- [ ] Circuit breaker half-opens after cooldown
- [ ] Retry with exponential backoff on transient errors
- [ ] Graceful degradation returns cached/rule-based results when all providers fail
- [ ] DOE self-annealing corrects model names from error responses

### Security
- [ ] Prompt injection patterns detected (10+ patterns)
- [ ] Output validated for sensitive data leakage
- [ ] Secrets redacted from AI responses
- [ ] RBAC permissions checked before AI operations
- [ ] Rate limiting enforced per user (per minute/hour/day)
- [ ] Allowed actions whitelist blocks unsafe remediations
- [ ] Safety levels enforced (safe/moderate/risky)
- [ ] All AI operations logged to audit table

### Monitoring
- [ ] Structured logs include provider, model, operation, tokens, cost
- [ ] Prometheus metrics exported for requests, latency, tokens, cost
- [ ] Provider health gauge updated on health checks
- [ ] Failover events counted and alerted
- [ ] OpenTelemetry traces span AI operations
- [ ] Dashboard shows cost breakdown by provider and operation

### Database
- [ ] All AI models created (conversations, messages, citations, etc.)
- [ ] Alembic migration generated and applied
- [ ] Indexes created on conversation_id, organization_id, date
- [ ] Unique constraint on component_analyses cache key
- [ ] Foreign keys reference users, organizations, findings tables
- [ ] Cascade deletes configured for conversation → messages → citations

### Integration Testing
- [ ] End-to-end: API request → agent → tool use → response
- [ ] Multi-provider: same query works on Claude, OpenAI, Ollama
- [ ] MCP round-trip: server exposes tool → client discovers → agent invokes
- [ ] Skill lifecycle: register → discover → invoke → record
- [ ] Failover: primary failure → automatic fallback
- [ ] Cost: operations tracked, budgets enforced, summary accurate
- [ ] Security: injection blocked, secrets redacted, RBAC enforced

---

## Appendix: Environment Variables

```bash
# .env (AI configuration section)

# Primary provider
AI_PROVIDER={AI_PRIMARY_PROVIDER}
AI_MODEL={AI_PRIMARY_MODEL}

# Anthropic (direct)
ANTHROPIC_API_KEY=sk-ant-...

# Azure AI Foundry (Claude via Azure)
AZURE_AI_FOUNDRY_ENDPOINT=https://{FOUNDRY_INSTANCE}.services.ai.azure.com/anthropic
AZURE_AI_FOUNDRY_API_KEY=...
ANTHROPIC_FOUNDRY_BASE_URL=https://{FOUNDRY_INSTANCE}.services.ai.azure.com/anthropic
ANTHROPIC_FOUNDRY_API_KEY=...
ANTHROPIC_MODEL={AI_PRIMARY_MODEL}

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Google Gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-pro-latest

# Local providers
OLLAMA_BASE_URL=http://localhost:11434
DOCKER_BASE_URL=http://host.docker.internal:12434
DOCKER_MODEL=ai/qwen3

# Failover
AI_ENABLE_FAILOVER=true
AI_FALLBACK_PROVIDER={AI_FALLBACK_PROVIDER}
AI_FALLBACK_MODEL={AI_FALLBACK_MODEL}

# Cost controls
AI_MAX_COST_PER_OPERATION={MAX_COST_PER_ANALYSIS}
AI_MAX_COST_PER_USER_DAILY=5.00
AI_MAX_COST_PER_ORG_DAILY=50.00

# MCP
MCP_SERVER_PORT={MCP_SERVER_PORT}
MCP_SERVER_TRANSPORT=streamable-http

# Timeouts
AI_AGENT_TIMEOUT={AGENT_TIMEOUT_SECONDS}
AI_MAX_RETRIES={MAX_RETRIES}
AI_MAX_ITERATIONS=10
```
