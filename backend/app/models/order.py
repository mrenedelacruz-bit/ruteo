import enum
from datetime import date, datetime

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class OrderStatus(str, enum.Enum):
    pending = "pending"
    assigned = "assigned"
    dispatched = "dispatched"
    delivered = "delivered"
    cancelled = "cancelled"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    status: Mapped[OrderStatus] = mapped_column(default=OrderStatus.pending)
    requested_date: Mapped[date | None] = mapped_column(nullable=True)
    # Fecha y hora de colocacion del pedido (UTC). Inmutable: nunca se
    # actualiza despues de crear el pedido.
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    # Fecha objetivo de entrega (services.promise_date.compute_promised_date
    # al crear el pedido); a diferencia de created_at, si se puede editar
    # despues (solo hacia el mismo dia del pedido o uno posterior).
    promised_date: Mapped[date] = mapped_column()
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    customer: Mapped["Customer"] = relationship()
    lines: Mapped[list["OrderLine"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    @property
    def total_quantity(self) -> float:
        return sum(float(line.quantity) for line in self.lines)


class OrderLine(Base):
    __tablename__ = "order_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2))

    order: Mapped["Order"] = relationship(back_populates="lines")
    product: Mapped["Product"] = relationship()
