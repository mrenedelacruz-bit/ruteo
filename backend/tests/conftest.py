"""Configuración de entorno para las pruebas.

Se ejecuta antes de importar `app.main`, así que aquí se apaga la siembra
automática y se aparta la base de archivo: cada prueba trae la suya en memoria.
"""

import os

os.environ.setdefault("SEED_ON_STARTUP", "false")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("PUBLIC_BASE_URL", "https://ejemplo.test/ruteo")
