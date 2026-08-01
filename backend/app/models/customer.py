from geoalchemy2 import Geography
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    rnc: Mapped[str | None] = mapped_column(String(32), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str] = mapped_column(String(255))
    location = mapped_column(Geography(geometry_type="POINT", srid=4326))
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
