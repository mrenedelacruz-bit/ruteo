import enum

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class TruckStatus(str, enum.Enum):
    active = "active"
    maintenance = "maintenance"
    out_of_service = "out_of_service"


class Truck(Base):
    __tablename__ = "trucks"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    # Operacion a la que esta asignada la unidad (FUEL OIL, JET TERPEL,
    # UP LIMPIO, etc.); None si no esta clasificada.
    operation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chassis_brand: Mapped[str] = mapped_column(String(80))
    chassis_year: Mapped[int | None] = mapped_column(nullable=True)
    tank_brand: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tank_year: Mapped[int | None] = mapped_column(nullable=True)
    total_capacity: Mapped[float] = mapped_column(Numeric(10, 2))
    capacity_unit: Mapped[str] = mapped_column(String(16), default="gal")
    status: Mapped[TruckStatus] = mapped_column(default=TruckStatus.active)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    compartments: Mapped[list["Compartment"]] = relationship(
        back_populates="truck", order_by="Compartment.position", cascade="all, delete-orphan"
    )

    @property
    def compartment_capacity_sum(self) -> float:
        return sum(float(c.capacity) for c in self.compartments)


class Compartment(Base):
    __tablename__ = "compartments"

    id: Mapped[int] = mapped_column(primary_key=True)
    truck_id: Mapped[int] = mapped_column(ForeignKey("trucks.id"))
    position: Mapped[int] = mapped_column()
    capacity: Mapped[float] = mapped_column(Numeric(10, 2))
    # Producto dedicado del compartimiento (evita contaminacion cruzada). NULL = flexible/multiproducto.
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)

    truck: Mapped["Truck"] = relationship(back_populates="compartments")
    product: Mapped["Product | None"] = relationship()
