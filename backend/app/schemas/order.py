from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.order import OrderStatus
from app.schemas.product import ProductRead


class OrderLineCreate(BaseModel):
    product_id: int
    quantity: float


class OrderCreate(BaseModel):
    customer_id: int
    requested_date: date | None = None
    notes: str | None = None
    lines: list[OrderLineCreate]


class OrderLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product: ProductRead
    quantity: float


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_id: int
    status: OrderStatus
    requested_date: date | None
    created_at: datetime  # fecha/hora de colocacion; inmutable
    promised_date: date  # fecha objetivo de entrega; editable (ver PATCH)
    notes: str | None
    lines: list[OrderLineRead]


class PromisedDateUpdate(BaseModel):
    promised_date: date
