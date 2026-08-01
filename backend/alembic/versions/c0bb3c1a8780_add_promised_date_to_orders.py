"""add promised_date to orders

Fecha objetivo de entrega: antes de las 4pm hora RD promete el dia
siguiente, a las 4pm o despues promete dos dias despues (ver
app/services/promise_date.py). Se agrega nullable, se rellenan los
pedidos existentes con la misma regla (usando su created_at) y luego se
deja NOT NULL.

Revision ID: c0bb3c1a8780
Revises: eed16a49fd9a
Create Date: 2026-07-14 00:11:54.243839

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c0bb3c1a8780'
down_revision: Union[str, None] = 'eed16a49fd9a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LOCAL_TS = "(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santo_Domingo')"


def upgrade() -> None:
    op.add_column("orders", sa.Column("promised_date", sa.Date(), nullable=True))
    op.execute(
        f"""
        UPDATE orders
        SET promised_date = (
            CASE
                WHEN EXTRACT(HOUR FROM {_LOCAL_TS}) < 16
                THEN {_LOCAL_TS}::date + INTERVAL '1 day'
                ELSE {_LOCAL_TS}::date + INTERVAL '2 day'
            END
        )::date
        WHERE promised_date IS NULL
        """
    )
    op.alter_column("orders", "promised_date", nullable=False)


def downgrade() -> None:
    op.drop_column("orders", "promised_date")
