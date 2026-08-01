"""Crea el usuario despachador inicial (idempotente).

Uso:
    ADMIN_USERNAME=admin ADMIN_PASSWORD=<clave> python -m app.seed.seed_users

Si no se pasan variables de entorno usa admin/admin123 y avisa que hay que
cambiar la clave.

Recuperar acceso sin consola (util en hosts sin shell, p.ej. el plan
gratuito de Render): si el usuario ya existe y no recuerdas su clave, pon
la variable de entorno ADMIN_RESET=true junto con ADMIN_PASSWORD y
redespliega (o reinicia el servicio) — este script va a actualizar la
clave del usuario existente en vez de omitirlo. Quita ADMIN_RESET despues
para que reinicios futuros no la vuelvan a pisar.
"""

import os

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "si", "sí")


def run() -> None:
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD")
    if password is None:
        password = "admin123"
        print("ADVERTENCIA: usando clave por defecto 'admin123'. Cambiarla de inmediato.")

    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.username == username))
        if existing:
            if _truthy(os.environ.get("ADMIN_RESET")):
                existing.password_hash = hash_password(password)
                existing.is_active = True
                db.commit()
                print(f"clave del usuario '{username}' actualizada (ADMIN_RESET=true)")
            else:
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
