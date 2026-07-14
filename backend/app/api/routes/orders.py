from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.models.customer import Customer
from app.models.order import Order, OrderLine, OrderStatus
from app.models.product import Product
from app.schemas.order import OrderCreate, OrderRead, PromisedDateUpdate
from app.services.promise_date import compute_promised_date, local_date

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

    now = datetime.utcnow()
    order = Order(
        customer_id=payload.customer_id,
        requested_date=payload.requested_date,
        created_at=now,
        promised_date=compute_promised_date(now),
        notes=payload.notes,
        lines=[OrderLine(product_id=l.product_id, quantity=l.quantity) for l in payload.lines],
    )
    db.add(order)
    db.commit()
    db.refresh(order, attribute_names=["lines"])
    return db.scalar(select(Order).options(_LOAD).where(Order.id == order.id))


@router.patch("/{order_id}/promised-date", response_model=OrderRead)
def update_promised_date(order_id: int, payload: PromisedDateUpdate, db: Session = Depends(get_db)):
    order = db.scalar(select(Order).options(_LOAD).where(Order.id == order_id))
    if order is None:
        raise HTTPException(404, "pedido no encontrado")
    if order.status in (OrderStatus.delivered, OrderStatus.cancelled):
        raise HTTPException(409, f"no se puede cambiar la fecha de un pedido {order.status.value}")
    if payload.promised_date < local_date(order.created_at):
        raise HTTPException(
            422, "la fecha de promesa no puede ser anterior a la fecha en que se coloco el pedido"
        )

    order.promised_date = payload.promised_date
    db.commit()
    db.refresh(order)
    return order
