from app.services.assignment import CompartmentSlot, Demand, TruckSlots, fleet_loading_status

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


def test_reports_ready_truck_with_all_compartments_filled():
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=3000),
        Demand(order_id=2, order_line_id=2, product_id=FUEL_OIL, quantity=2000),
    ]
    trucks = [truck(1, "T-01", [(3000, FUEL_OIL), (2000, FUEL_OIL)])]

    [status] = fleet_loading_status(demands, trucks)

    assert status.ready_to_dispatch is True
    assert all(c.filled and c.quantity_missing == 0.0 for c in status.compartments)


def test_reports_missing_quantity_for_an_incomplete_compartment():
    demands = [Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=1200)]
    trucks = [truck(1, "T-01", [(3000, FUEL_OIL), (2000, FUEL_OIL)])]

    [status] = fleet_loading_status(demands, trucks)

    assert status.ready_to_dispatch is False
    comp_3000 = next(c for c in status.compartments if c.compartment.capacity == 3000)
    assert not comp_3000.filled
    assert comp_3000.candidate_product_id == FUEL_OIL
    assert comp_3000.quantity_available == 1200
    assert comp_3000.quantity_missing == 1800


def test_reports_no_candidate_when_nothing_matches_a_dedicated_compartment():
    demands = [Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=500)]
    trucks = [truck(1, "T-01", [(3000, FUEL_OIL)])]

    [status] = fleet_loading_status(demands, trucks)

    comp = status.compartments[0]
    assert not comp.filled
    assert comp.candidate_product_id is None
    assert comp.quantity_available == 0.0
    assert comp.quantity_missing == 3000


def test_evaluates_every_compartment_even_after_one_fails():
    """A diferencia del despacho real (que corta en el primer
    compartimiento que falla, por eficiencia), la vista previa debe
    reportar el estado de TODOS los compartimientos del camion."""
    demands = [Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=2000)]
    trucks = [truck(1, "T-01", [(3000, FUEL_OIL), (2000, FUEL_OIL), (1000, FUEL_OIL)])]

    [status] = fleet_loading_status(demands, trucks)

    assert len(status.compartments) == 3
    filled = [c for c in status.compartments if c.filled]
    assert len(filled) == 1
    assert filled[0].compartment.capacity == 2000


def test_completed_truck_consumes_demand_leaving_less_for_the_next_one():
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=FUEL_OIL, quantity=2000),
        Demand(order_id=2, order_line_id=2, product_id=FUEL_OIL, quantity=1500),
    ]
    trucks = [
        truck(1, "T-chico", [(2000, FUEL_OIL)]),
        truck(2, "T-grande", [(3500, FUEL_OIL)]),
    ]

    statuses = fleet_loading_status(demands, trucks)
    by_code = {s.truck_code: s for s in statuses}

    assert by_code["T-chico"].ready_to_dispatch is True
    # el camion grande necesita 3500; tras consumir 2000 en T-chico solo queda 1500 disponible en total
    assert by_code["T-grande"].ready_to_dispatch is False
    assert by_code["T-grande"].compartments[0].quantity_available == 1500
    assert by_code["T-grande"].compartments[0].quantity_missing == 2000


def test_flexible_compartment_reports_the_best_available_candidate():
    demands = [
        Demand(order_id=1, order_line_id=1, product_id=DIESEL, quantity=800),
        Demand(order_id=2, order_line_id=2, product_id=GASOLINA, quantity=500),
    ]
    trucks = [truck(1, "T-WOP", [(3000, None)])]

    [status] = fleet_loading_status(demands, trucks)

    comp = status.compartments[0]
    assert not comp.filled
    assert comp.candidate_product_id == DIESEL  # tiene mas demanda disponible que GASOLINA
    assert comp.quantity_available == 800
    assert comp.quantity_missing == 2200
