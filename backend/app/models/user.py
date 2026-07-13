import enum

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class UserRole(str, enum.Enum):
    # dispatcher: gestiona flota y genera despachos (incluye todo lo de clerk)
    # clerk: toma pedidos y da de alta clientes
    dispatcher = "dispatcher"
    clerk = "clerk"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[UserRole] = mapped_column(default=UserRole.clerk)
    is_active: Mapped[bool] = mapped_column(default=True)
