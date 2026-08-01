"""add truck operation and rename fleet to real fichas

El cliente autorizo usar las fichas reales de la flota (sin placas ni
chasis/VIN). Renombra las unidades ya sembradas con codigos anonimos
T-01..T-10 a sus fichas reales, les asigna su operacion, y retira el
camion provisional T-50 (reemplazado por las unidades reales de Juan
Dolio WOP: L-33, L-55, L-56, que llegan via seed). Si T-50 ya tiene
viajes registrados no se puede borrar (integridad referencial); en ese
caso se desactiva con una nota.

Revision ID: 3f9e6824e12c
Revises: c0bb3c1a8780
Create Date: 2026-08-01 03:03:34.745198

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3f9e6824e12c'
down_revision: Union[str, None] = 'c0bb3c1a8780'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RENAMES = {
    "T-01": "L-4",
    "T-02": "L-6",
    "T-03": "L-7",
    "T-04": "L-11",
    "T-05": "L-15",
    "T-06": "L-36",
    "T-07": "L-44",
    "T-08": "L-46",
    "T-09": "L-47",
    "T-10": "L-61",
}


def upgrade() -> None:
    op.add_column("trucks", sa.Column("operation", sa.String(length=64), nullable=True))

    conn = op.get_bind()
    for old, new in _RENAMES.items():
        # solo renombrar si la ficha real no existe ya (instalaciones
        # nuevas nunca tuvieron los codigos T-xx)
        conn.exec_driver_sql(
            """
            UPDATE trucks SET code = %s, operation = 'FUEL OIL'
            WHERE code = %s
              AND NOT EXISTS (SELECT 1 FROM trucks t2 WHERE t2.code = %s)
            """,
            (new, old, new),
        )

    # retirar el T-50 provisional: borrar si no tiene viajes, si no desactivar
    conn.exec_driver_sql(
        """
        DELETE FROM compartments
        WHERE truck_id IN (SELECT id FROM trucks WHERE code = 'T-50')
          AND NOT EXISTS (
            SELECT 1 FROM trips tr
            JOIN trucks t ON t.id = tr.truck_id
            WHERE t.code = 'T-50'
          )
        """
    )
    conn.exec_driver_sql(
        """
        DELETE FROM trucks
        WHERE code = 'T-50'
          AND NOT EXISTS (SELECT 1 FROM trips tr WHERE tr.truck_id = trucks.id)
        """
    )
    conn.exec_driver_sql(
        """
        UPDATE trucks
        SET status = 'out_of_service',
            notes = 'Unidad provisional retirada; reemplazada por las fichas reales L-33/L-55/L-56'
        WHERE code = 'T-50'
        """
    )


def downgrade() -> None:
    conn = op.get_bind()
    for old, new in _RENAMES.items():
        conn.exec_driver_sql("UPDATE trucks SET code = %s WHERE code = %s", (old, new))
    op.drop_column("trucks", "operation")
