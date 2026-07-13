"""Crea el usuario despachador inicial (idempotente).

Uso:
    ADMIN_USERNAME=admin ADMIN_PASSWORD=<clave> python -m app.seed.seed_users

Si no se pasan variables de entorno usa admin/admin123 y avisa que hay que
cambiar la clave.
"""

import os

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole


def run() -> None:
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD")
    if password is None:
        password = "admin123"
        print("ADVERTENCIA: usando clave por defecto 'admin123'. Cambiarla de inmediato.")

    db = SessionLocal()
    try:
        if db.scalar(select(User).where(User.username == username)):
            print(f"el usuario '{username}' ya existe; no se modifica")
            return
        db.add(
            User(
                username=username,
                full_name="Despachador",
                password_hash=hash_password(password),
                role=UserRole.dispatcher,
            )
        )
        db.commit()
        print(f"+ usuario despachador '{username}' creado")
    finally:
        db.close()


if __name__ == "__main__":
    run()
