"""split WOP into real products

"WOP" (white oil products) resulto ser una categoria, no un producto en
si: el camion que la usaba transporta en realidad Diesel Regular, Diesel
Premium, Gasolina Regular y Gasolina Premium. Esta es una migracion de
datos (no de esquema): agrega esos 4 productos, libera los compartimientos
que apuntaban a "WOP" (quedan flexibles hasta confirmar que compartimiento
corresponde a cada producto) y elimina el producto generico "WOP".

Revision ID: eed16a49fd9a
Revises: b4eb596814b7
Create Date: 2026-07-13 23:21:40.810263

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'eed16a49fd9a'
down_revision: Union[str, None] = 'b4eb596814b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_PRODUCTS = [
    ("DIESEL_REGULAR", "Diesel Regular"),
    ("DIESEL_PREMIUM", "Diesel Premium"),
    ("GASOLINA_REGULAR", "Gasolina Regular"),
    ("GASOLINA_PREMIUM", "Gasolina Premium"),
]


def upgrade() -> None:
    conn = op.get_bind()

    for code, name in _NEW_PRODUCTS:
        exists = conn.exec_driver_sql(
            "SELECT 1 FROM products WHERE code = %s", (code,)
        ).first()
        if not exists:
            conn.exec_driver_sql(
                "INSERT INTO products (code, name, unit) VALUES (%s, %s, 'gal')",
                (code, name),
            )

    conn.exec_driver_sql(
        """
        UPDATE compartments SET product_id = NULL
        WHERE product_id IN (SELECT id FROM products WHERE code = 'WOP')
        """
    )
    conn.exec_driver_sql("DELETE FROM products WHERE code = 'WOP'")


def downgrade() -> None:
    # Migracion de datos, no reversible con exactitud: no se sabe que
    # compartimiento tenia originalmente el producto generico "WOP" antes
    # del upgrade. Se deja el producto generico disponible de nuevo por si
    # se necesita revertir manualmente.
    conn = op.get_bind()
    exists = conn.exec_driver_sql("SELECT 1 FROM products WHERE code = 'WOP'").first()
    if not exists:
        conn.exec_driver_sql("INSERT INTO products (code, name, unit) VALUES ('WOP', 'WOP', 'gal')")
