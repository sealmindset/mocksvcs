"""Configuration for the mock Cribl Stream server."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class MockCriblSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MOCK_CRIBL_",
        extra="ignore",
    )

    # Auth
    auth_token: str = "mock-cribl-dev-token"

    # Server
    host: str = "0.0.0.0"
    port: int = 10080

    # Store
    max_events: int = 10_000


settings = MockCriblSettings()
