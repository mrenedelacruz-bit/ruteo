"""Carga inicial (idempotente) de productos, deposito y flota real.

Uso:
    python -m app.seed.seed_fleet
"""

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.geo import point_wkt
from app.models.depot import Depot
from app.models.product import Product
from app.models.truck import Compartment, Truck, TruckStatus
from app.seed.fleet_data import DEPOT, FLEET, PRODUCTS


def run() -> None:
    db = SessionLocal()
    try:
        products_by_code = {}
        for p in PRODUCTS:
            product = db.scalar(select(Product).where(Product.code == p["code"]))
            if product is None:
                product = Product(**p)
                db.add(product)
                db.flush()
                print(f"+ producto {p['code']}")
            products_by_code[p["code"]] = product

        if not db.scalar(select(Depot).where(Depot.name == DEPOT["name"])):
            db.add(
                Depot(
                    name=DEPOT["name"],
                    address=DEPOT["address"],
                    location=point_wkt(DEPOT["lat"], DEPOT["lng"]),
                )
            )
            print(f"+ deposito {DEPOT['name']}")

        for t in FLEET:
            if db.scalar(select(Truck).where(Truck.code == t["code"])):
                continue
            compartments = t["compartments"]
            truck = Truck(
                code=t["code"],
                operation=t.get("operation"),
                chassis_brand=t["chassis_brand"],
                chassis_year=t["chassis_year"],
                tank_brand=t["tank_brand"],
                tank_year=t["tank_year"],
                total_capacity=t["total_capacity"],
                capacity_unit="gal",
                status=TruckStatus(t["status"]),
                notes=t["notes"],
                compartments=[
                    Compartment(
                        position=i + 1,
                        capacity=c["capacity"],
                        product_id=products_by_code[c["product_code"]].id
                        if c["product_code"]
                        else None,
                    )
                    for i, c in enumerate(compartments)
                ],
            )
            db.add(truck)
            total = sum(c["capacity"] for c in compartments)
            print(f"+ camion {t['code']} ({total} gal en {len(compartments)} compartimientos)")

        db.commit()
        print("Seed completado.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
