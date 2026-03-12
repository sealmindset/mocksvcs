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

    # Upstream proxy (pull-through cache)
    # When enabled, if an image isn't found locally, mock-acr fetches it from
    # the upstream registry and caches it for future pulls.
    proxy_enabled: bool = True
    proxy_upstream_url: str = "https://registry-1.docker.io"
    proxy_auth_url: str = "https://auth.docker.io/token"
    proxy_auth_service: str = "registry.docker.io"
    # Skip TLS verification for upstream fetches (needed when Zscaler intercepts
    # TLS and the container doesn't have the Zscaler CA cert installed)
    proxy_tls_verify: bool = False
    # Optional: path to a CA bundle (e.g., Zscaler root CA) for verified upstream
    proxy_ca_cert: str = ""


settings = MockACRSettings()
