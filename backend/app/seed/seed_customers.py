"""Carga inicial (idempotente) de clientes reales.

Uso:
    python -m app.seed.seed_customers
"""

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.geo import point_wkt
from app.models.customer import Customer
from app.seed.customer_data import CUSTOMERS


def run() -> None:
    db = SessionLocal()
    try:
        for c in CUSTOMERS:
            if db.scalar(select(Customer).where(Customer.name == c["name"])):
                continue
            db.add(
                Customer(
                    name=c["name"],
                    address=c["address"],
                    location=point_wkt(c["lat"], c["lng"]),
                    phone=c["phone"],
                    rnc=c["rnc"],
                    notes=c["notes"],
                )
            )
            print(f"+ cliente {c['name']}")

        db.commit()
        print("Seed completado.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
