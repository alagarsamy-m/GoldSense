"""
GoldSense Backend — Configuration & Settings
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_service_key: str

    # Groq LLM
    groq_api_key: str

    # Paths
    dataset_path: str = str(Path(__file__).parent.parent.parent / "dataset")
    model_path: str = str(Path(__file__).parent.parent.parent / "ml" / "model" / "gold_model.pkl")
    metadata_path: str = str(Path(__file__).parent.parent.parent / "ml" / "model" / "model_metadata.json")
    logs_csv_path: str = str(Path(__file__).parent.parent.parent / "dataset" / "prediction_logs.csv")

    # CORS — set ALLOWED_ORIGINS env var in production (comma-separated)
    allowed_origins: str = "http://localhost:5173,http://localhost:3000,https://gold-sense-five.vercel.app"

    # API settings
    app_name: str = "GoldSense API"
    app_version: str = "1.0.0"
    debug: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
