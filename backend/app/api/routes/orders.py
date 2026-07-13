from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.models.customer import Customer
from app.models.order import Order, OrderLine, OrderStatus
from app.models.product import Product
from app.schemas.order import OrderCreate, OrderRead

router = APIRouter(prefix="/orders", tags=["orders"])

_LOAD = selectinload(Order.lines).selectinload(OrderLine.product)


@router.get("", response_model=list[OrderRead])
def list_orders(status: OrderStatus | None = None, db: Session = Depends(get_db)):
    stmt = select(Order).options(_LOAD)
    if status is not None:
        stmt = stmt.where(Order.status == status)
    return db.scalars(stmt).all()


@router.post("", response_model=OrderRead, status_code=201)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    if not db.get(Customer, payload.customer_id):
        raise HTTPException(404, "cliente no encontrado")
    if not payload.lines:
        raise HTTPException(422, "el pedido debe tener al menos una linea de producto")

    product_ids = {line.product_id for line in payload.lines}
    found = set(db.scalars(select(Product.id).where(Product.id.in_(product_ids))).all())
    missing = product_ids - found
    if missing:
        raise HTTPException(404, f"productos no encontrados: {sorted(missing)}")

    order = Order(
        customer_id=payload.customer_id,
        requested_date=payload.requested_date,
        notes=payload.notes,
        lines=[OrderLine(product_id=l.product_id, quantity=l.quantity) for l in payload.lines],
    )
    db.add(order)
    db.commit()
    db.refresh(order, attribute_names=["lines"])
    return db.scalar(select(Order).options(_LOAD).where(Order.id == order.id))
