from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://ruteo:ruteo@localhost:5432/ruteo"
    default_capacity_unit: str = "gal"

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, v: str) -> str:
        # Proveedores de hosting (Render, Heroku, etc.) entregan URLs
        # postgres://... o postgresql://... sin el driver; SQLAlchemy con
        # psycopg3 necesita el sufijo +psycopg explicito.
        if v.startswith("postgres://"):
            return "postgresql+psycopg://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            return "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    # Geocodificacion de direcciones (Nominatim/OpenStreetMap)
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    geocode_user_agent: str = "ruteo-app"
    # Limitar resultados a Republica Dominicana
    geocode_country_codes: str = "do"

    # Motor de distancias viales (OSRM). Vacio = usar distancia haversine.
    osrm_base_url: str = "https://router.project-osrm.org"

    # Autenticacion JWT. OBLIGATORIO cambiar el secreto en produccion.
    jwt_secret: str = "cambiar-este-secreto-en-produccion"
    jwt_expire_minutes: int = 480


@lru_cache
def get_settings() -> Settings:
    return Settings()
