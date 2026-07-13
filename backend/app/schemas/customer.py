from pydantic import BaseModel, ConfigDict


class CustomerCreate(BaseModel):
    name: str
    rnc: str | None = None
    phone: str | None = None
    address: str
    lat: float
    lng: float
    notes: str | None = None


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    rnc: str | None
    phone: str | None
    address: str
    lat: float
    lng: float
    notes: str | None
