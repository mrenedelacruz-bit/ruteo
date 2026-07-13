from app.services.assignment import CompartmentSlot, Demand, TruckSlots, assign_orders_to_fleet

FUEL_OIL = 1
DIESEL = 2


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


def test_single_order_fits_in_one_compartment():
    demands = [Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=4000)]
    trucks = [truck(1, "T-01", [(5000, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert len(result.allocations) == 1
    assert result.allocations[0].compartment_id == 101
    assert result.allocations[0].quantity == 4000
    assert not result.shortfalls


def test_demand_larger_than_any_compartment_is_split():
    demands = [Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=7500)]
    trucks = [truck(1, "T-05", [(5100, FUEL_OIL), (6900, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert not result.shortfalls
    assert len(result.allocations) == 2
    assert sum(a.quantity for a in result.allocations) == 7500
    # el compartimiento mas grande se usa primero para minimizar el numero de fracciones
    assert {a.compartment_id for a in result.allocations} == {101, 102}


def test_a_used_compartment_is_never_split_between_two_different_orders():
    """Un compartimiento nunca debe mezclar producto de dos pedidos distintos,
    aunque le quede espacio libre despues de servir al primer pedido."""
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=7500),
        Demand(order_id=2, order_line_id=2, product_id=FUEL_OIL, quantity=3000),
    ]
    trucks = [truck(1, "T-05", [(5100, FUEL_OIL), (6900, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    order2_allocs = [a for a in result.allocations if a.order_id == 2]
    order1_compartments = {a.compartment_id for a in result.allocations if a.order_id == 1}
    order2_compartments = {a.compartment_id for a in order2_allocs}
    assert order1_compartments.isdisjoint(order2_compartments)
    # T-05 ya no tiene espacio (5100+6900=12000 == 7500+... no cabe el pedido 2 completo)
    assert result.shortfalls, "el pedido 2 no debe caber en el mismo camion ya usado"


def test_consolidates_multiple_orders_onto_one_truck_when_capacity_allows():
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=3000),
        Demand(order_id=2, order_line_id=2, product_id=FUEL_OIL, quantity=2000),
    ]
    trucks = [
        truck(1, "T-A", [(3000, FUEL_OIL), (2000, FUEL_OIL)]),
        truck(2, "T-B", [(3000, FUEL_OIL), (2000, FUEL_OIL)]),
    ]

    result = assign_orders_to_fleet(demands, trucks)

    assert {a.truck_id for a in result.allocations} == {1}
    assert not result.shortfalls


def test_dedicated_compartment_only_accepts_its_own_product():
    demands = [Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=1000)]
    trucks = [truck(1, "T-01", [(5000, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert not result.allocations
    assert result.shortfalls == [Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=1000)]


def test_flexible_compartment_accepts_any_product():
    demands = [Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=1000)]
    trucks = [truck(1, "T-01", [(5000, None)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert len(result.allocations) == 1
    assert not result.shortfalls


def test_shortfall_when_total_fleet_capacity_is_insufficient():
    demands = [Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=20000)]
    trucks = [truck(1, "T-01", [(5000, FUEL_OIL)])]

    result = assign_orders_to_fleet(demands, trucks)

    assert sum(a.quantity for a in result.allocations) == 5000
    assert sum(s.quantity for s in result.shortfalls) == 15000
