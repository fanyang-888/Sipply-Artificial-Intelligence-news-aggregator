from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment (see `.env.example`)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: SecretStr
    app_env: str
    source_fetch_user_agent: str

    openai_api_key: SecretStr | None = None
    redis_url: SecretStr | None = None
    admin_api_key: SecretStr | None = None
    # Trend Radar YouTube source; the source is skipped while this is unset
    youtube_api_key: SecretStr | None = None
    # Trend Radar Bluesky source (handle + an app password from bsky.app settings)
    bluesky_handle: str | None = None
    bluesky_app_password: SecretStr | None = None
    # Trend Radar Threads source (long-lived token with threads_keyword_search; expires in 60 days)
    threads_access_token: SecretStr | None = None

    # JWT auth
    jwt_secret: SecretStr | None = None
    admin_username: str = "admin"
    admin_password: SecretStr | None = None

    @field_validator("database_url", mode="before")
    @classmethod
    def ensure_psycopg_driver(cls, v: object) -> object:
        """Auto-convert postgresql:// → postgresql+psycopg:// so Railway's default URL works."""
        raw = v if isinstance(v, str) else str(v)
        if raw.startswith("postgresql://"):
            return raw.replace("postgresql://", "postgresql+psycopg://", 1)
        return v


settings = Settings()
