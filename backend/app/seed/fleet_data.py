"""Datos de la flota real de la empresa, anonimizados (sin placas ni VIN).

Fuente: hoja de control de flota de camiones cisterna suministrada por el
cliente. Las fichas originales fueron reemplazadas por codigos genericos
T-01..T-10 y se omitieron placas y numeros de chasis/tanque a peticion
explicita. Capacidades en galones (gal).

Cada compartimiento indica su propio "product_code": None significa
compartimiento flexible (admite cualquier producto), util cuando aun no se
conoce la asignacion exacta compartimiento-producto.
"""

FLEET: list[dict] = [
    {
        "code": "T-01",
        "chassis_brand": "FREIGHTLINER COLUMBIA",
        "chassis_year": 2008,
        "tank_brand": "HEIL",
        "tank_year": 1987,
        "total_capacity": 10_000,
        "compartments": [
            {"capacity": 3_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 3_000, "product_code": "FUEL_OIL"},
        ],
        "status": "out_of_service",
        "notes": "Accidente Pedernales; en reparacion de motor",
    },
    {
        "code": "T-02",
        "chassis_brand": "FREIGHTLINER",
        "chassis_year": 2013,
        "tank_brand": "HEIL",
        "tank_year": 1976,
        "total_capacity": 10_000,
        "compartments": [
            {"capacity": 6_000, "product_code": "FUEL_OIL"},
            {"capacity": 4_000, "product_code": "FUEL_OIL"},
        ],
        "status": "active",
        "notes": None,
    },
    {
        "code": "T-03",
        "chassis_brand": "FREIGHTLINER",
        "chassis_year": 2011,
        "tank_brand": "FRUEHAUF",
        "tank_year": 1984,
        "total_capacity": 10_000,
        "compartments": [
            {"capacity": 5_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 3_000, "product_code": "FUEL_OIL"},
        ],
        "status": "maintenance",
        "notes": "Pendiente renovacion ministerio",
    },
    {
        "code": "T-04",
        "chassis_brand": "FREIGHTLINER",
        "chassis_year": 2011,
        "tank_brand": "HEIL",
        "tank_year": 1989,
        "total_capacity": 11_000,
        "compartments": [
            {"capacity": 3_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 1_500, "product_code": "FUEL_OIL"},
            {"capacity": 2_500, "product_code": "FUEL_OIL"},
        ],
        "status": "active",
        "notes": None,
    },
    {
        "code": "T-05",
        "chassis_brand": "FREIGHTLINER",
        "chassis_year": 2012,
        "tank_brand": "FRUEHAUF",
        "tank_year": 1988,
        "total_capacity": 12_000,
        "compartments": [
            {"capacity": 5_100, "product_code": "FUEL_OIL"},
            {"capacity": 6_900, "product_code": "FUEL_OIL"},
        ],
        "status": "active",
        "notes": None,
    },
    {
        "code": "T-06",
        "chassis_brand": "SCANIA",
        "chassis_year": 2018,
        "tank_brand": "HEIL",
        "tank_year": 2001,
        "total_capacity": 12_500,
        "compartments": [
            {"capacity": 4_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 1_500, "product_code": "FUEL_OIL"},
            {"capacity": 3_000, "product_code": "FUEL_OIL"},
        ],
        "status": "active",
        "notes": None,
    },
    {
        "code": "T-07",
        "chassis_brand": "FREIGHTLINER COLUMBIA",
        "chassis_year": 2013,
        "tank_brand": "HEIL",
        "tank_year": 1998,
        "total_capacity": 10_000,
        "compartments": [
            {"capacity": 4_000, "product_code": "FUEL_OIL"},
            {"capacity": 3_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 1_000, "product_code": "FUEL_OIL"},
        ],
        "status": "active",
        "notes": "Cliente dedicado: COSANCA",
    },
    {
        "code": "T-08",
        "chassis_brand": "FREIGHTLINER COLUMBIA",
        "chassis_year": 2013,
        "tank_brand": "HEIL",
        "tank_year": 1998,
        "total_capacity": 10_000,
        "compartments": [
            {"capacity": 4_000, "product_code": "FUEL_OIL"},
            {"capacity": 3_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 1_000, "product_code": "FUEL_OIL"},
        ],
        "status": "active",
        "notes": "Cliente dedicado: COSANCA",
    },
    {
        "code": "T-09",
        "chassis_brand": "FREIGHTLINER COLUMBIA",
        "chassis_year": 2012,
        "tank_brand": "HEIL",
        "tank_year": 1999,
        "total_capacity": 10_000,
        "compartments": [
            {"capacity": 4_000, "product_code": "FUEL_OIL"},
            {"capacity": 3_000, "product_code": "FUEL_OIL"},
            {"capacity": 2_000, "product_code": "FUEL_OIL"},
            {"capacity": 1_000, "product_code": "FUEL_OIL"},
        ],
        "status": "active",
        "notes": None,
    },
    {
        # Camion WOP ("white oil products"): transporta Diesel Regular,
        # Diesel Premium, Gasolina Regular y Gasolina Premium en vez de
        # Fuel Oil. Sus 4 compartimientos son intencionalmente flexibles
        # (product_code=None): cualquiera puede llevar cualquiera de los
        # 4 productos, y esa asignacion puede cambiar en cada viaje.
        "code": "T-10",
        "chassis_brand": "FREIGHTLINER COLUMBIA",
        "chassis_year": 2016,
        "tank_brand": "HEIL",
        "tank_year": 2012,
        "total_capacity": 10_000,
        "compartments": [
            {"capacity": 4_000, "product_code": None},
            {"capacity": 1_000, "product_code": None},
            {"capacity": 3_000, "product_code": None},
            {"capacity": 2_000, "product_code": None},
        ],
        "status": "active",
        "notes": "Camion WOP (diesel/gasolina); compartimientos flexibles, cualquiera admite cualquiera de los 4 productos. Cliente dedicado: COSANCA",
    },
    {
        # Camion WOP adicional, misma distribucion de compartimientos y
        # flexibilidad que T-10. Marca/año de chasis y tanque pendientes
        # de confirmar.
        "code": "T-50",
        "chassis_brand": "N/D",
        "chassis_year": None,
        "tank_brand": "N/D",
        "tank_year": None,
        "total_capacity": 10_000,
        "compartments": [
            {"capacity": 4_000, "product_code": None},
            {"capacity": 1_000, "product_code": None},
            {"capacity": 3_000, "product_code": None},
            {"capacity": 2_000, "product_code": None},
        ],
        "status": "active",
        "notes": "Camion WOP (diesel/gasolina); compartimientos flexibles; faltan datos de chasis/tanque",
    },
]

PRODUCTS = [
    {"code": "FUEL_OIL", "name": "Fuel Oil", "unit": "gal"},
    {"code": "DIESEL_REGULAR", "name": "Diesel Regular", "unit": "gal"},
    {"code": "DIESEL_PREMIUM", "name": "Diesel Premium", "unit": "gal"},
    {"code": "GASOLINA_REGULAR", "name": "Gasolina Regular", "unit": "gal"},
    {"code": "GASOLINA_PREMIUM", "name": "Gasolina Premium", "unit": "gal"},
]

# Coordenadas de la Refineria Dominicana de Petroleos (REFIDOMSA), Haina,
# San Cristobal.
DEPOT = {
    "name": "Refineria Dominicana de Petroleos (REFIDOMSA)",
    "address": "Carretera Sanchez Km. 17.5, Zona Industrial de Haina, San Cristobal",
    "lat": 18.4239,
    "lng": -70.0242,
}
