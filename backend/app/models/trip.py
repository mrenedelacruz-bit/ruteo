import enum
from datetime import datetime

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class TripStatus(str, enum.Enum):
    planned = "planned"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(primary_key=True)
    truck_id: Mapped[int] = mapped_column(ForeignKey("trucks.id"))
    depot_id: Mapped[int] = mapped_column(ForeignKey("depots.id"))
    status: Mapped[TripStatus] = mapped_column(default=TripStatus.planned)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    driver_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    total_distance_km: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    truck: Mapped["Truck"] = relationship()
    depot: Mapped["Depot"] = relationship()
    stops: Mapped[list["TripStop"]] = relationship(
        back_populates="trip", order_by="TripStop.sequence", cascade="all, delete-orphan"
    )
    allocations: Mapped[list["CompartmentAllocation"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )


class TripStop(Base):
    __tablename__ = "trip_stops"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"))
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    sequence: Mapped[int] = mapped_column()
    distance_from_prev_km: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="stops")
    order: Mapped["Order"] = relationship()


class CompartmentAllocation(Base):
    """Registra que producto y cantidad de una linea de pedido va en cual compartimiento de un viaje."""

    __tablename__ = "compartment_allocations"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"))
    compartment_id: Mapped[int] = mapped_column(ForeignKey("compartments.id"))
    order_line_id: Mapped[int] = mapped_column(ForeignKey("order_lines.id"))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2))

    trip: Mapped["Trip"] = relationship(back_populates="allocations")
    compartment: Mapped["Compartment"] = relationship()
    order_line: Mapped["OrderLine"] = relationship()
