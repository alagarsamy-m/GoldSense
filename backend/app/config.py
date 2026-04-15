"""
Backend configuration.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).parent.parent


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
    groq_api_key: str

    alphavantage_key: str = ""
    newsapi_key: str = ""
    public_app_url: str = "https://gold-sense-five.vercel.app"

    firebase_project_id: str = ""
    firebase_client_email: str = ""
    firebase_private_key: str = ""
    firebase_service_account_json: str = ""
    firebase_service_account_path: str = ""

    dataset_path: str = str(Path(__file__).parent.parent.parent / "dataset")
    model_path: str = str(Path(__file__).parent.parent.parent / "ml" / "model" / "gold_model.pkl")
    metadata_path: str = str(Path(__file__).parent.parent.parent / "ml" / "model" / "model_metadata.json")
    logs_csv_path: str = str(Path(__file__).parent.parent.parent / "dataset" / "prediction_logs.csv")

    allowed_origins: str = "http://localhost:5173,http://localhost:3000,https://gold-sense-five.vercel.app"
    app_name: str = "GoldSense API"
    app_version: str = "2.1.0"
    debug: str | bool = False

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()
