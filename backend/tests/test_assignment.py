from app.services.assignment import CompartmentSlot, Demand, TruckSlots, assign_orders_to_fleet

FUEL_OIL = 1
DIESEL = 2
GASOLINA = 3


def truck(truck_id, code, compartments):
    """compartments: lista de (capacity, product_id | None)"""
    return TruckSlots(
        truck_id=truck_id,
        truck_code=code,
        compartments=[
            CompartmentSlot(compartment_id=truck_id * 100 + i, position=i, capacity=cap, product_id=prod)
            for i, (cap, prod) in enumerate(compartments, start=1)
        ],
    )


def test_truck_only_dispatches_when_every_compartment_is_exactly_full():
    # el pedido no alcanza para llenar ninguno de los dos compartimientos
    demands = [Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=2000)]
    trucks = [truck(1, "T-01", [(3000, FUEL_OIL), (2000, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert result.allocations == []  # el camion no sale incompleto
    assert not result.shortfalls  # no es un shortfall real, solo falta volumen


def test_truck_dispatches_once_demand_exactly_covers_every_compartment():
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=3000),
        Demand(order_id=2, order_line_id=2, product_id=FUEL_OIL, quantity=2000),
    ]
    trucks = [truck(1, "T-01", [(3000, FUEL_OIL), (2000, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert len(result.allocations) == 2
    assert sum(a.quantity for a in result.allocations) == 5000
    assert {a.compartment_position for a in result.allocations} == {1, 2}


def test_single_line_can_be_split_across_two_compartments_to_complete_the_truck():
    # una sola linea de 5000 llena exactamente los dos compartimientos (3000+2000)
    demands = [Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=5000)]
    trucks = [truck(1, "T-01", [(3000, FUEL_OIL), (2000, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert len(result.allocations) == 2
    assert sum(a.quantity for a in result.allocations) == 5000
    assert all(a.order_line_id == 1 for a in result.allocations)


def test_multiple_orders_combine_to_fill_one_compartment_exactly():
    # ningun pedido solo llena el compartimiento de 3000, pero juntos si
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=1000),
        Demand(order_id=2, order_line_id=2, product_id=FUEL_OIL, quantity=1500),
        Demand(order_id=3, order_line_id=3, product_id=FUEL_OIL, quantity=500),
    ]
    trucks = [truck(1, "T-01", [(3000, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert len(result.allocations) == 3
    assert sum(a.quantity for a in result.allocations) == 3000


def test_multi_product_order_consolidates_onto_one_truck():
    """El pedido de un cliente con dos combustibles debe preferir un solo
    camion (una linea por compartimiento) en vez de repartirse."""
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=2000),
        Demand(order_id=1, order_line_id=2, product_id=GASOLINA, quantity=1000),
    ]
    trucks = [
        truck(1, "T-A", [(2000, DIESEL), (1000, GASOLINA)]),
        truck(2, "T-B", [(2000, DIESEL), (1000, GASOLINA)]),
    ]

    result = assign_orders_to_fleet(demands, trucks)

    assert len(result.allocations) == 2
    assert len({a.truck_id for a in result.allocations}) == 1


def test_multi_product_order_splits_across_trucks_when_it_does_not_fit_in_one():
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=2000),
        Demand(order_id=1, order_line_id=2, product_id=GASOLINA, quantity=1000),
    ]
    trucks = [
        truck(1, "T-diesel", [(2000, DIESEL)]),
        truck(2, "T-gasolina", [(1000, GASOLINA)]),
    ]

    result = assign_orders_to_fleet(demands, trucks)

    assert len(result.allocations) == 2
    assert {a.truck_id for a in result.allocations} == {1, 2}


def test_flexible_compartment_with_allowed_set_rejects_other_products():
    """Un compartimiento flexible WOP admite solo su lista de productos
    permitidos (los blancos): un producto fuera de la lista (p.ej. jet
    fuel) no debe entrar ahi, y sin otro camion que lo lleve es shortfall."""
    JET = 9
    demands = [Demand(order_id=1, order_line_id=1, product_id=JET, quantity=1000)]
    trucks = [
        TruckSlots(
            truck_id=1,
            truck_code="T-WOP",
            compartments=[
                CompartmentSlot(
                    compartment_id=101,
                    position=1,
                    capacity=1000,
                    product_id=None,
                    allowed_product_ids=frozenset({DIESEL, GASOLINA}),
                )
            ],
        )
    ]

    result = assign_orders_to_fleet(demands, trucks)

    assert result.allocations == []
    assert len(result.shortfalls) == 1 and result.shortfalls[0].product_id == JET


def test_flexible_compartment_can_take_any_product_and_choice_can_vary():
    demands = [Demand(order_id=1, order_line_id=1, product_id=GASOLINA, quantity=1000)]
    trucks = [truck(1, "T-WOP", [(1000, None)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert len(result.allocations) == 1
    assert result.allocations[0].product_id == GASOLINA


def test_flexible_compartment_never_mixes_two_different_products():
    """Un compartimiento flexible debe llenarse con un UNICO producto,
    aunque combinar dos productos distintos tambien sumara exacto."""
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=1500),
        Demand(order_id=2, order_line_id=2, product_id=GASOLINA, quantity=1500),
    ]
    trucks = [truck(1, "T-WOP", [(3000, None)])]

    result = assign_orders_to_fleet(demands, trucks)

    # ningun producto solo llega a 3000, asi que el camion no se completa
    assert result.allocations == []


def test_flexible_compartment_picks_a_single_product_that_exactly_fits():
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=1000),
        Demand(order_id=2, order_line_id=2, product_id=DIESEL, quantity=2000),
        Demand(order_id=3, order_line_id=3, product_id=GASOLINA, quantity=500),
    ]
    trucks = [truck(1, "T-WOP", [(3000, None)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert len(result.allocations) == 2
    assert {a.product_id for a in result.allocations} == {DIESEL}
    assert sum(a.quantity for a in result.allocations) == 3000


def test_dedicated_compartments_are_filled_before_flexible_ones():
    """Un compartimiento flexible no debe 'robarse' demanda que un
    compartimiento dedicado del mismo camion tambien necesita."""
    demands = [Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=1000)]
    trucks = [truck(1, "T-01", [(1000, None), (1000, DIESEL)])]

    result = assign_orders_to_fleet(demands, trucks)

    # solo hay demanda para un compartimiento; el camion no se completa
    assert result.allocations == []


def test_shortfall_when_no_active_compartment_can_ever_carry_the_product():
    """Sin compartimientos dedicados a ese producto ni ninguno flexible en
    toda la flota activa, nunca se podra transportar: es un shortfall
    real, no un pedido pendiente por volumen."""
    demands = [Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=1000)]
    trucks = [truck(1, "T-01", [(1000, FUEL_OIL)]), truck(2, "T-02", [(2000, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert result.allocations == []
    assert result.shortfalls == [Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=1000)]


def test_no_shortfall_when_any_truck_has_a_flexible_compartment():
    demands = [Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=1000)]
    trucks = [truck(1, "T-01", [(1000, FUEL_OIL)]), truck(2, "T-WOP", [(5000, None)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert not result.shortfalls  # el camion flexible en principio podria cargarlo (aunque hoy no se complete)


def test_larger_trucks_are_tried_first_to_maximize_dispatched_volume():
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=2000),
        Demand(order_id=2, order_line_id=2, product_id=FUEL_OIL, quantity=8000),
    ]
    trucks = [
        truck(1, "T-grande", [(10000, FUEL_OIL)]),
        truck(2, "T-chico", [(2000, FUEL_OIL)]),
    ]

    result = assign_orders_to_fleet(demands, trucks)

    # el grande absorbe ambos pedidos completos (2000+8000=10000 exacto);
    # llenarlo primero evita que el chico tome el pedido de 2000 y deje
    # los 8000 restantes varados sin camion que se complete
    assert {a.truck_id for a in result.allocations} == {1}
    assert sum(a.quantity for a in result.allocations) == 10000


def test_line_that_cannot_be_fully_covered_stays_entirely_pending():
    """Nunca recortar un pedido en silencio: si la corrida solo puede
    cargar una parte de una linea, la linea completa queda pendiente."""
    demands = [Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=14500)]
    trucks = [truck(1, "T-A", [(4000, FUEL_OIL), (1500, FUEL_OIL), (3000, FUEL_OIL), (3500, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    # T-A (12000) podria llenarse con 12000 de los 14500, pero los 2500
    # restantes no tendrian camion: la linea se difiere entera
    assert result.allocations == []
    assert not result.shortfalls  # hay flota capaz; solo falta volumen/capacidad hoy


def test_exact_fit_truck_takes_the_full_line():
    demands = [Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=14500)]
    trucks = [
        truck(1, "T-12000", [(4000, FUEL_OIL), (1500, FUEL_OIL), (3000, FUEL_OIL), (3500, FUEL_OIL)]),
        truck(2, "T-14500", [(5000, FUEL_OIL), (9500, FUEL_OIL)]),
    ]

    result = assign_orders_to_fleet(demands, trucks)

    assert {a.truck_id for a in result.allocations} == {2}
    assert sum(a.quantity for a in result.allocations) == 14500
