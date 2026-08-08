import SwiftUI
import MapKit

struct MapaPropiedadesView: View {
    let propiedades: [Propiedad]
    @Binding var seleccion: Propiedad?

    @State private var camara: MapCameraPosition = .automatic
    /// El binding de selección de `Map` trabaja con el tag de la anotación,
    /// no con el modelo: se usa el UUID y se resuelve contra la lista.
    @State private var idSeleccionado: UUID?

    var body: some View {
        Map(position: $camara, selection: $idSeleccionado) {
            ForEach(propiedades) { propiedad in
                Marker(propiedad.codigo, systemImage: simbolo(propiedad), coordinate: propiedad.coordenada)
                    .tint(color(propiedad))
                    .tag(propiedad.id)
            }
            UserAnnotation()
        }
        .mapControls {
            MapUserLocationButton()
            MapCompass()
            MapScaleView()
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .onChange(of: idSeleccionado) { _, nuevo in
            seleccion = propiedades.first { $0.id == nuevo }
        }
        .onChange(of: seleccion) { _, nueva in
            // Al cerrarse la hoja de detalle se limpia la selección del mapa,
            // si no el marcador queda resaltado y no se puede volver a tocar.
            if nueva == nil { idSeleccionado = nil }
        }
        .onAppear(perform: encuadrar)
        .onChange(of: propiedades.count) { _, _ in encuadrar() }
        .navigationTitle("Mapa")
        .navigationBarTitleDisplayMode(.inline)
        .overlay(alignment: .bottom) {
            if propiedades.isEmpty {
                Text("Sin propiedades georreferenciadas")
                    .font(.footnote)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.bottom, 24)
            }
        }
    }

    /// Encuadra todas las propiedades con un margen del 25 %.
    /// Con una sola propiedad el bounding box degenera a un punto, así que
    /// se fuerza un span mínimo o el mapa aparecería a nivel de calle-cero.
    private func encuadrar() {
        guard !propiedades.isEmpty else { return }

        let latitudes = propiedades.map(\.latitud)
        let longitudes = propiedades.map(\.longitud)
        guard let minLat = latitudes.min(), let maxLat = latitudes.max(),
              let minLon = longitudes.min(), let maxLon = longitudes.max() else { return }

        let centro = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta: max((maxLat - minLat) * 1.25, 0.005),
            longitudeDelta: max((maxLon - minLon) * 1.25, 0.005)
        )
        camara = .region(MKCoordinateRegion(center: centro, span: span))
    }

    private func simbolo(_ propiedad: Propiedad) -> String {
        propiedad.estado == .activa ? "tag.fill" : "mappin"
    }

    private func color(_ propiedad: Propiedad) -> Color {
        switch propiedad.estado {
        case .activa:      return .green
        case .sinEtiqueta: return .orange
        case .borrador:    return .gray
        case .baja:        return .red
        }
    }
}
