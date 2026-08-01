from geoalchemy2 import Geography
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Depot(Base):
    """Punto de origen de despacho (p.ej. Refineria Dominicana de Petroleos, Haina)."""

    __tablename__ = "depots"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    address: Mapped[str] = mapped_column(String(255))
    location = mapped_column(Geography(geometry_type="POINT", srid=4326))
