import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct RootView: View {
    @Environment(\.modelContext) private var contexto
    @EnvironmentObject private var servicioNFC: ServicioNFC

    /// Ordenadas por código para que el inventario sea estable entre sesiones.
    @Query(sort: \Propiedad.codigo) private var propiedades: [Propiedad]

    @State private var pestana = Pestana.mapa
    @State private var propiedadSeleccionada: Propiedad?
    @State private var error: ErrorPresentable?
    @State private var mostrandoCaptura = false
    @State private var mostrandoImportador = false
    @State private var avisoImportacion: ErrorPresentable?

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
        .alert(item: $avisoImportacion) { aviso in
            Alert(title: Text("Importación"), message: Text(aviso.mensaje), dismissButton: .default(Text("Entendido")))
        }
        .fileImporter(
            isPresented: $mostrandoImportador,
            allowedContentTypes: Self.tiposGeoJSON
        ) { resultado in
            switch resultado {
            case .success(let url): importar(desde: url)
            case .failure(let fallo): error = ErrorPresentable(mensaje: fallo.localizedDescription)
            }
        }
    }

    /// `.geojson` no tiene UTType del sistema: se declara por extensión y
    /// se acepta también `.json` plano como respaldo.
    private static let tiposGeoJSON: [UTType] =
        [UTType(filenameExtension: "geojson"), .json].compactMap { $0 }

    @ToolbarContentBuilder
    private var barra: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                // La exportación se genera bajo demanda: el archivo temporal
                // solo existe mientras dura el share sheet.
                if let url = try? ExportadorGeoJSON.escribirArchivo(propiedades) {
                    ShareLink(item: url) { Label("Exportar GeoJSON", systemImage: "square.and.arrow.up") }
                        .disabled(propiedades.isEmpty)
                }
                Button {
                    mostrandoImportador = true
                } label: {
                    Label("Importar GeoJSON", systemImage: "square.and.arrow.down")
                }
            } label: {
                Label("Datos", systemImage: "square.and.arrow.up.on.square")
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

    /// Importa un FeatureCollection desde el proveedor de documentos.
    /// Los duplicados por UUID se omiten: lo corregido en campo manda
    /// sobre cualquier archivo. El reporte completo se muestra al usuario.
    private func importar(desde url: URL) {
        do {
            // Fuera del sandbox de la app, el acceso exige el scope de seguridad.
            let accesoConcedido = url.startAccessingSecurityScopedResource()
            defer { if accesoConcedido { url.stopAccessingSecurityScopedResource() } }

            let datos = try Data(contentsOf: url)
            let resultado = try ImportadorGeoJSON.importar(datos, existentes: Set(propiedades.map(\.id)))
            resultado.nuevas.forEach(contexto.insert)
            try contexto.save()
            avisoImportacion = ErrorPresentable(mensaje: resultado.resumen)
        } catch {
            self.error = ErrorPresentable(mensaje: error.localizedDescription)
        }
    }

    /// Lee una etiqueta y abre la propiedad correspondiente.
    private func escanear() async {
        do {
            let lectura = try await servicioNFC.leer()
            let id = lectura.payload.id
            // #Predicate no admite propiedades computadas ni capturas de
            // tipos no soportados: el UUID se extrae a una constante antes.
            var descriptor = FetchDescriptor<Propiedad>(predicate: #Predicate { $0.id == id })
            descriptor.fetchLimit = 1

            guard let encontrada = try contexto.fetch(descriptor).first else {
                error = ErrorPresentable(
                    mensaje: "La etiqueta es válida (\(lectura.payload.codigo.isEmpty ? id.uuidString : lectura.payload.codigo)) pero esa propiedad no existe en este dispositivo. Sincroniza o impórtala antes de continuar."
                )
                return
            }

            // Verificación anti-clonación: el payload NDEF se puede copiar
            // a otra etiqueta, el UID de fábrica del chip no. Un serial
            // distinto al registrado no abre la ficha.
            if let registrado = encontrada.etiquetaSerial, registrado != lectura.serial {
                error = ErrorPresentable(
                    mensaje: ErrorNFC.serialNoCoincide(esperado: registrado, leido: lectura.serial)
                        .errorDescription ?? "Serial no coincide"
                )
                return
            }

            // Backfill: etiqueta grabada antes de la migración a
            // NFCTagReaderSession — se adopta su serial en esta lectura.
            if encontrada.etiquetaSerial == nil, encontrada.etiquetaEscritaEn != nil {
                encontrada.adoptarSerialNFC(lectura.serial)
                try? contexto.save()
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
                if propiedad.tienePrecisionConocida {
                    Text(String(format: "±%.0f m", propiedad.precisionHorizontal))
                        .font(.caption2)
                        .foregroundStyle(propiedad.precisionHorizontal <= 15 ? .secondary : .orange)
                } else {
                    // Importada sin dato de precisión: se marca para invitar
                    // a validarla en campo, no se muestra un número falso.
                    Text("precisión s/d")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
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
