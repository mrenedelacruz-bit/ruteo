from pydantic import BaseModel, ConfigDict


class ProductCreate(BaseModel):
    code: str
    name: str
    unit: str = "gal"


class ProductRead(ProductCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
