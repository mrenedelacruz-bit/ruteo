from pydantic import BaseModel, ConfigDict, field_validator

from app.models.truck import TruckStatus


class CompartmentCreate(BaseModel):
    position: int
    capacity: float
    product_id: int | None = None  # None = compartimiento flexible/multiproducto


class CompartmentRead(CompartmentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    truck_id: int


class TruckCreate(BaseModel):
    code: str
    operation: str | None = None
    chassis_brand: str
    chassis_year: int | None = None
    tank_brand: str | None = None
    tank_year: int | None = None
    total_capacity: float
    capacity_unit: str = "gal"
    status: TruckStatus = TruckStatus.active
    notes: str | None = None
    compartments: list[CompartmentCreate]

    @field_validator("compartments")
    @classmethod
    def must_not_exceed_total_capacity(cls, v: list[CompartmentCreate], info):
        total = info.data.get("total_capacity")
        if total is not None and sum(c.capacity for c in v) > float(total) + 0.01:
            raise ValueError("la suma de compartimientos supera la capacidad total del camion")
        return v


class TruckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    operation: str | None
    chassis_brand: str
    chassis_year: int | None
    tank_brand: str | None
    tank_year: int | None
    total_capacity: float
    capacity_unit: str
    status: TruckStatus
    notes: str | None
    compartments: list[CompartmentRead]
