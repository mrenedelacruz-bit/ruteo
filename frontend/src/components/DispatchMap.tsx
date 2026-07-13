import { Fragment } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Depot, TripOut } from "../api/types";

const depotIcon = new L.DivIcon({
  html: `<div style="background:#1d4ed8;width:14px;height:14px;border-radius:50%;border:2px solid white"></div>`,
  className: "",
  iconSize: [14, 14],
});

const TRIP_COLORS = ["#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04"];

function stopIcon(color: string) {
  return new L.DivIcon({
    html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white"></div>`,
    className: "",
    iconSize: [12, 12],
  });
}

export function DispatchMap({ depot, trips }: { depot: Depot; trips: TripOut[] }) {
  return (
    <MapContainer center={[depot.lat, depot.lng]} zoom={10} style={{ height: 420, width: "100%" }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[depot.lat, depot.lng]} icon={depotIcon}>
        <Popup>{depot.name}</Popup>
      </Marker>
      {trips.map((trip, i) => {
        const color = TRIP_COLORS[i % TRIP_COLORS.length];
        const positions: [number, number][] = [
          [depot.lat, depot.lng],
          ...trip.stops.map((s) => [s.lat, s.lng] as [number, number]),
        ];
        return (
          <Fragment key={trip.truck_code}>
            <Polyline positions={positions} pathOptions={{ color, weight: 3 }} />
            {trip.stops.map((s) => (
              <Marker key={s.order_id} position={[s.lat, s.lng]} icon={stopIcon(color)}>
                <Popup>
                  <strong>{trip.truck_code}</strong> — parada #{s.sequence}
                  <br />
                  {s.customer_name}
                  <br />
                  {s.address}
                </Popup>
              </Marker>
            ))}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
