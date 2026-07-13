from pydantic import BaseModel, ConfigDict


class DepotCreate(BaseModel):
    name: str
    address: str
    lat: float
    lng: float


class DepotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    address: str
    lat: float
    lng: float
