"""Configuración central de la API (12-factor: todo por variables de entorno)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Raíz del paquete backend/ — se usa para resolver rutas relativas (SQLite, uploads).
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Ajustes leídos de variables de entorno o de un archivo `.env`."""

    # --- Identidad de la API -------------------------------------------------
    APP_NAME: str = "API de Bienes Muebles NFC"
    APP_VERSION: str = "0.1.0"
    API_PREFIX: str = "/api/v1"

    # --- Base de datos -------------------------------------------------------
    # SQLite por defecto para el prototipo. En producción basta con exportar
    # DATABASE_URL=postgresql+psycopg://usuario:clave@host/bd — SQLModel/SQLAlchemy
    # hacen el resto sin cambiar código.
    DATABASE_URL: str = f"sqlite:///{BACKEND_ROOT / 'bienes.db'}"

    # --- CORS ----------------------------------------------------------------
    # La PWA se sirve desde otro origen (Vite en dev, GitHub Pages en prod),
    # así que el navegador exige CORS explícito.
    CORS_ORIGINS: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "https://mrenedelacruz-bit.github.io"
    )

    # --- Dominio público de la PWA ------------------------------------------
    # Es la base con la que se arman las URLs que se graban en las etiquetas NFC:
    #   {PUBLIC_BASE_URL}/activo/{ncf}
    PUBLIC_BASE_URL: str = "https://mrenedelacruz-bit.github.io/ruteo"

    # --- Semilla -------------------------------------------------------------
    SEED_ON_STARTUP: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS_ORIGINS viene como CSV; FastAPI espera una lista."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Singleton cacheado: evita releer el entorno en cada request."""
    return Settings()


settings = get_settings()
