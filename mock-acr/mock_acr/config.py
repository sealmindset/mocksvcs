"""Configuration for the mock ACR server."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class MockACRSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MOCK_ACR_",
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 5100

    # Registry identity (appears in auth challenges and token responses)
    registry_name: str = "mockacr"
    registry_host: str = "localhost:5100"

    # Storage
    data_dir: str = "/data"

    # Auth (mock -- always grants access)
    token_lifetime: int = 3600  # 1 hour


settings = MockACRSettings()
