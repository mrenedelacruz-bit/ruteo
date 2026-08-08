import SwiftUI
import SwiftData
import CoreLocation

/// Alta de una propiedad con captura GPS controlada.
///
/// Flujo deliberado: primero se fija la posición, después se guarda. No se
/// permite guardar sin fix — una propiedad sin coordenada válida ensucia el
/// mapa y el export, y corregirla luego exige volver al sitio.
struct CapturaPropiedadView: View {
    @Environment(\.modelContext) private var contexto
    @Environment(\.dismiss) private var cerrar
    @EnvironmentObject private var ubicacion: ServicioUbicacion

    @State private var codigo = ""
    @State private var nombre = ""
    @State private var notas = ""
    @State private var fix: CLLocation?
    @State private var error: ErrorPresentable?

    private var puedeGuardar: Bool {
        fix != nil && !codigo.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        Form {
            Section("Identificación") {
                TextField("Código", text: $codigo)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                TextField("Nombre", text: $nombre)
            }

            Section {
                seccionUbicacion
            } header: {
                Text("Ubicación")
            } footer: {
                Text("Se exige una precisión de ±\(Int(ServicioUbicacion.precisionMaximaAceptable)) m o mejor. Captura al aire libre y con el dispositivo quieto.")
            }

            Section("Notas") {
                TextField("Observaciones de campo", text: $notas, axis: .vertical)
                    .lineLimit(3...6)
            }
        }
        .navigationTitle("Nueva propiedad")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancelar") { ubicacion.cancelar(); cerrar() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Guardar", action: guardar).disabled(!puedeGuardar)
            }
        }
        .alert(item: $error) { error in
            Alert(title: Text("Error"), message: Text(error.mensaje), dismissButton: .default(Text("Entendido")))
        }
        .task { ubicacion.solicitarPermiso() }
    }

    @ViewBuilder
    private var seccionUbicacion: some View {
        if let fix {
            LabeledContent("Latitud", value: String(format: "%.7f", fix.coordinate.latitude))
            LabeledContent("Longitud", value: String(format: "%.7f", fix.coordinate.longitude))
            LabeledContent("Precisión") {
                Text(String(format: "±%.1f m", fix.horizontalAccuracy))
                    .foregroundStyle(fix.horizontalAccuracy <= ServicioUbicacion.precisionObjetivo ? .green : .orange)
            }
            Button("Volver a capturar", action: capturar)
        } else if ubicacion.capturando {
            HStack {
                ProgressView()
                VStack(alignment: .leading) {
                    Text("Fijando posición…")
                    if let precision = ubicacion.precisionActual {
                        Text(String(format: "mejor lectura: ±%.0f m", precision))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.leading, 8)
            }
        } else {
            Button("Capturar posición actual", systemImage: "location.fill", action: capturar)
        }
    }

    private func capturar() {
        Task {
            do {
                fix = try await ubicacion.capturar()
            } catch is CancellationError {
                return
            } catch {
                self.error = ErrorPresentable(mensaje: error.localizedDescription)
            }
        }
    }

    private func guardar() {
        guard let fix else { return }
        let propiedad = Propiedad(
            codigo: codigo.trimmingCharacters(in: .whitespaces),
            nombre: nombre.trimmingCharacters(in: .whitespaces),
            latitud: fix.coordinate.latitude,
            longitud: fix.coordinate.longitude,
            precisionHorizontal: fix.horizontalAccuracy,
            // verticalAccuracy negativa significa "sin altitud válida":
            // guardar el 0 que trae CoreLocation en ese caso es un dato falso.
            altitud: fix.verticalAccuracy >= 0 ? fix.altitude : nil,
            notas: notas,
            estado: .sinEtiqueta
        )
        contexto.insert(propiedad)
        do {
            try contexto.save()
            cerrar()
        } catch {
            self.error = ErrorPresentable(mensaje: "No se pudo guardar: \(error.localizedDescription)")
        }
    }
}
