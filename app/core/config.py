"""Runtime settings, read from environment variables with the prefix ``PASSREADY_``."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PASSREADY_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "PassReady DPP API"
    environment: str = Field(default="dev", description="dev | test | prod")
    resolver_base_url: str = Field(
        default="https://id.passready.example",
        description=(
            "GS1 Digital Link root printed into the QR code. Must stay stable for the "
            "lifetime of the labels (ESPR Art. 10, prEN 18221)."
        ),
    )
    landing_page_base_url: str | None = Field(
        default=None,
        description="If set, browsers (Accept: text/html) are redirected here instead of JSON.",
    )
    brand_api_key: str = Field(
        default="demo-brand-key",
        description="Shared secret for brand endpoints (MVP stand-in for OAuth2/JWT).",
    )
    authority_api_key: str = Field(
        default="demo-authority-key",
        description="Shared secret that unlocks the 'authority' role on the resolver.",
    )
    supplier_token_ttl_days: int = Field(default=30, ge=1)
    cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        description="Browser origins allowed to call the API directly (frontend hosts).",
    )
    seed_demo_data: bool = True
    portal_base_url: str = Field(
        default="http://localhost:5173",
        description="Frontend origin; supplier links in reminders point here (/supplier/...)",
    )
    reminder_interval_days: int = Field(
        default=7,
        ge=1,
        description="A pending supplier is 'due' for a reminder after this many days",
    )
    media_dir: str = Field(default="media", description="Local folder for uploaded product images")
    media_base_url: str = Field(
        default="http://localhost:8000/media",
        description="Public base URL under which /media files are served (https in production)",
    )
    database_url: str | None = Field(
        default=None,
        description="PostgreSQL DSN. Unset = in-memory repository (JSONB-shaped documents).",
    )
