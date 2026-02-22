"""Configuration for the mock GitHub API server."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class MockGitHubSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MOCK_GITHUB_",
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 8090
    default_user_login: str = "mock-user"
    default_org: str = "mock-org"
    auto_create_repos: bool = True
    log_level: str = "info"


settings = MockGitHubSettings()
