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


def test_smaller_trucks_are_completed_first():
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=2000),
        Demand(order_id=2, order_line_id=2, product_id=FUEL_OIL, quantity=8000),
    ]
    trucks = [
        truck(1, "T-grande", [(10000, FUEL_OIL)]),
        truck(2, "T-chico", [(2000, FUEL_OIL)]),
    ]

    result = assign_orders_to_fleet(demands, trucks)

    # el camion chico se completa con el pedido 1; no queda demanda para
    # completar el grande (8000 < 10000), asi que ese se queda pendiente
    assert {a.truck_id for a in result.allocations} == {2}
