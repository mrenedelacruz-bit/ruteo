from pydantic import BaseModel, ConfigDict


class CustomerCreate(BaseModel):
    name: str
    rnc: str | None = None
    phone: str | None = None
    address: str
    lat: float
    lng: float
    notes: str | None = None


class CustomerUpdate(BaseModel):
    """Solo los campos enviados se actualizan; lat y lng van juntos."""

    name: str | None = None
    rnc: str | None = None
    phone: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
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
