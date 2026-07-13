from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://ruteo:ruteo@localhost:5432/ruteo"
    default_capacity_unit: str = "gal"


@lru_cache
def get_settings() -> Settings:
    return Settings()
