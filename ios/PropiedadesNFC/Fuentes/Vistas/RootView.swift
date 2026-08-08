import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var contexto
    @EnvironmentObject private var servicioNFC: ServicioNFC

    /// Ordenadas por código para que el inventario sea estable entre sesiones.
    @Query(sort: \Propiedad.codigo) private var propiedades: [Propiedad]

    @State private var pestana = Pestana.mapa
    @State private var propiedadSeleccionada: Propiedad?
    @State private var error: ErrorPresentable?
    @State private var mostrandoCaptura = false

    private enum Pestana { case mapa, inventario }

    var body: some View {
        TabView(selection: $pestana) {
            NavigationStack {
                MapaPropiedadesView(
                    propiedades: propiedades,
                    seleccion: $propiedadSeleccionada
                )
                .toolbar { barra }
            }
            .tabItem { Label("Mapa", systemImage: "map") }
            .tag(Pestana.mapa)

            NavigationStack {
                InventarioView(propiedades: propiedades, seleccion: $propiedadSeleccionada)
                    .toolbar { barra }
            }
            .tabItem { Label("Inventario", systemImage: "list.bullet.rectangle") }
            .tag(Pestana.inventario)
        }
        .sheet(item: $propiedadSeleccionada) { propiedad in
            NavigationStack { DetallePropiedadView(propiedad: propiedad) }
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $mostrandoCaptura) {
            NavigationStack { CapturaPropiedadView() }
        }
        .alert(item: $error) { error in
            Alert(title: Text("Error"), message: Text(error.mensaje), dismissButton: .default(Text("Entendido")))
        }
    }

    @ToolbarContentBuilder
    private var barra: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            // La exportación se genera bajo demanda: el archivo temporal
            // solo existe mientras dura el share sheet.
            if let url = try? ExportadorGeoJSON.escribirArchivo(propiedades) {
                ShareLink(item: url) { Label("Exportar", systemImage: "square.and.arrow.up") }
                    .disabled(propiedades.isEmpty)
            }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            if servicioNFC.disponible {
                Button {
                    Task { await escanear() }
                } label: {
                    Label("Escanear", systemImage: "wave.3.right")
                }
                .disabled(servicioNFC.operacionEnCurso)
            }
            Button {
                mostrandoCaptura = true
            } label: {
                Label("Nueva propiedad", systemImage: "plus")
            }
        }
    }

    /// Lee una etiqueta y abre la propiedad correspondiente.
    private func escanear() async {
        do {
            let payload = try await servicioNFC.leer()
            let id = payload.id
            // #Predicate no admite propiedades computadas ni capturas de
            // tipos no soportados: el UUID se extrae a una constante antes.
            var descriptor = FetchDescriptor<Propiedad>(predicate: #Predicate { $0.id == id })
            descriptor.fetchLimit = 1

            guard let encontrada = try contexto.fetch(descriptor).first else {
                error = ErrorPresentable(
                    mensaje: "La etiqueta es válida (\(payload.codigo.isEmpty ? id.uuidString : payload.codigo)) pero esa propiedad no existe en este dispositivo. Sincroniza o impórtala antes de continuar."
                )
                return
            }
            propiedadSeleccionada = encontrada
        } catch let fallo as ErrorNFC {
            guard !fallo.esSilencioso else { return }
            error = ErrorPresentable(mensaje: fallo.errorDescription ?? "Error de lectura NFC")
        } catch {
            self.error = ErrorPresentable(mensaje: error.localizedDescription)
        }
    }
}

/// Envoltorio mínimo para poder usar `.alert(item:)` con un mensaje suelto.
struct ErrorPresentable: Identifiable {
    let id = UUID()
    let mensaje: String
}

// MARK: - Inventario

struct InventarioView: View {
    let propiedades: [Propiedad]
    @Binding var seleccion: Propiedad?

    @Environment(\.modelContext) private var contexto
    @State private var busqueda = ""

    private var filtradas: [Propiedad] {
        guard !busqueda.isEmpty else { return propiedades }
        return propiedades.filter {
            $0.codigo.localizedCaseInsensitiveContains(busqueda) ||
            $0.nombre.localizedCaseInsensitiveContains(busqueda)
        }
    }

    var body: some View {
        List {
            ForEach(filtradas) { propiedad in
                Button { seleccion = propiedad } label: { FilaPropiedad(propiedad: propiedad) }
                    .buttonStyle(.plain)
            }
            .onDelete(perform: eliminar)
        }
        .searchable(text: $busqueda, prompt: "Código o nombre")
        .overlay {
            if propiedades.isEmpty {
                ContentUnavailableView(
                    "Sin propiedades",
                    systemImage: "mappin.slash",
                    description: Text("Captura la primera propiedad con el botón +.")
                )
            }
        }
        .navigationTitle("Inventario")
    }

    private func eliminar(_ indices: IndexSet) {
        for indice in indices { contexto.delete(filtradas[indice]) }
    }
}

struct FilaPropiedad: View {
    let propiedad: Propiedad

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: propiedad.estado == .activa ? "tag.fill" : "tag")
                .foregroundStyle(color)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(propiedad.nombre).font(.body)
                Text(propiedad.codigo).font(.caption).foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(propiedad.estado.titulo).font(.caption2)
                Text(String(format: "±%.0f m", propiedad.precisionHorizontal))
                    .font(.caption2)
                    .foregroundStyle(propiedad.precisionHorizontal <= 15 ? .secondary : .orange)
            }
        }
        .contentShape(Rectangle())
    }

    private var color: Color {
        switch propiedad.estado {
        case .activa:      return .green
        case .sinEtiqueta: return .orange
        case .borrador:    return .gray
        case .baja:        return .red
        }
    }
}
