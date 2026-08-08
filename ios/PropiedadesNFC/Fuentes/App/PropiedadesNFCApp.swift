import SwiftUI
import SwiftData

@main
struct PropiedadesNFCApp: App {

    /// Contenedor único de la app. Se declara explícito (en vez del
    /// `.modelContainer(for:)` implícito) para poder fijar el nombre del
    /// store y añadir migraciones cuando el esquema evolucione.
    private let contenedor: ModelContainer = {
        let esquema = Schema([Propiedad.self])
        let configuracion = ModelConfiguration(
            "PropiedadesNFC",
            schema: esquema,
            isStoredInMemoryOnly: false
        )
        do {
            return try ModelContainer(for: esquema, configurations: [configuracion])
        } catch {
            // Un fallo aquí significa store corrupto o esquema incompatible.
            // Fallar ruidosamente en vez de arrancar con datos silenciosamente
            // vacíos, que en campo se traduce en recapturar todo el inventario.
            fatalError("No se pudo abrir el almacén SwiftData: \(error)")
        }
    }()

    @StateObject private var servicioNFC = ServicioNFC()
    @StateObject private var servicioUbicacion = ServicioUbicacion()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(servicioNFC)
                .environmentObject(servicioUbicacion)
        }
        .modelContainer(contenedor)
    }
}
