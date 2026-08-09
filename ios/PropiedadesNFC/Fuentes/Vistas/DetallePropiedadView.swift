import SwiftUI
import SwiftData
import MapKit

struct DetallePropiedadView: View {
    @Bindable var propiedad: Propiedad

    @Environment(\.modelContext) private var contexto
    @Environment(\.dismiss) private var cerrar
    @EnvironmentObject private var servicioNFC: ServicioNFC
    @EnvironmentObject private var ubicacion: ServicioUbicacion

    @State private var error: ErrorPresentable?
    @State private var confirmandoReubicacion = false
    @State private var confirmandoBloqueo = false
    @State private var mensajeExito: String?

    var body: some View {
        Form {
            Section("Identificación") {
                TextField("Código", text: $propiedad.codigo)
                TextField("Nombre", text: $propiedad.nombre)
                Picker("Estado", selection: Binding(
                    get: { propiedad.estado },
                    set: { propiedad.estado = $0; propiedad.actualizadoEn = .now }
                )) {
                    ForEach(EstadoPropiedad.allCases, id: \.self) { estado in
                        Text(estado.titulo).tag(estado)
                    }
                }
            }

            Section("Ubicación") {
                Map(initialPosition: .region(regionDetalle)) {
                    Marker(propiedad.codigo, coordinate: propiedad.coordenada)
                }
                .frame(height: 160)
                .listRowInsets(EdgeInsets())
                .allowsHitTesting(false)

                LabeledContent("Latitud", value: String(format: "%.7f", propiedad.latitud))
                LabeledContent("Longitud", value: String(format: "%.7f", propiedad.longitud))
                LabeledContent(
                    "Precisión",
                    value: propiedad.tienePrecisionConocida
                        ? String(format: "±%.1f m", propiedad.precisionHorizontal)
                        : "sin dato (importada)"
                )
                if let altitud = propiedad.altitud {
                    LabeledContent("Altitud", value: String(format: "%.1f m", altitud))
                }
                Button("Reubicar en mi posición actual") { confirmandoReubicacion = true }
                    .disabled(ubicacion.capturando)
            }

            Section {
                if servicioNFC.disponible {
                    Button {
                        Task { await grabarEtiqueta() }
                    } label: {
                        Label(
                            propiedad.etiquetaEscritaEn == nil ? "Grabar etiqueta NFC" : "Regrabar etiqueta NFC",
                            systemImage: "wave.3.right.circle"
                        )
                    }
                    // Con la etiqueta bloqueada la regrabación fallaría en la
                    // sesión: mejor no ofrecer el botón.
                    .disabled(servicioNFC.operacionEnCurso || propiedad.etiquetaBloqueadaEn != nil)

                    if propiedad.etiquetaEscritaEn != nil, propiedad.etiquetaBloqueadaEn == nil {
                        Button(role: .destructive) {
                            confirmandoBloqueo = true
                        } label: {
                            Label("Bloquear etiqueta (permanente)", systemImage: "lock")
                        }
                        .disabled(servicioNFC.operacionEnCurso)
                    }
                } else {
                    Label("NFC no disponible en este dispositivo", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.secondary)
                }

                if let escritaEn = propiedad.etiquetaEscritaEn {
                    LabeledContent("Grabada", value: escritaEn.formatted(date: .abbreviated, time: .shortened))
                }
                if let bloqueadaEn = propiedad.etiquetaBloqueadaEn {
                    LabeledContent("Bloqueada") {
                        Label(
                            bloqueadaEn.formatted(date: .abbreviated, time: .shortened),
                            systemImage: "lock.fill"
                        )
                        .foregroundStyle(.secondary)
                    }
                }
                if let serial = propiedad.etiquetaSerial {
                    LabeledContent("Serial", value: serial)
                }
            } header: {
                Text("Etiqueta NFC")
            } footer: {
                Text("Se graban \((try? propiedad.payloadNFC.tamanoEstimado()) ?? 0) bytes. Verifica que la etiqueta tenga capacidad suficiente (NTAG213 = 137 B útiles).")
            }

            Section("Trazabilidad") {
                LabeledContent("Capturada", value: propiedad.capturadoEn.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Actualizada", value: propiedad.actualizadoEn.formatted(date: .abbreviated, time: .shortened))
                TextField("Notas", text: $propiedad.notas, axis: .vertical).lineLimit(2...8)
            }
        }
        .navigationTitle(propiedad.codigo)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Listo") { guardar(); cerrar() }
            }
        }
        .confirmationDialog(
            "Se sustituirán las coordenadas actuales por tu posición GPS. El valor anterior queda registrado en las notas.",
            isPresented: $confirmandoReubicacion,
            titleVisibility: .visible
        ) {
            Button("Reubicar", role: .destructive) { Task { await reubicar() } }
            Button("Cancelar", role: .cancel) {}
        }
        .confirmationDialog(
            "El bloqueo es PERMANENTE: la etiqueta física nunca más admitirá regrabación. Antes de bloquear se verificará que la etiqueta acercada corresponde a «\(propiedad.codigo)».",
            isPresented: $confirmandoBloqueo,
            titleVisibility: .visible
        ) {
            Button("Bloquear definitivamente", role: .destructive) { Task { await bloquearEtiqueta() } }
            Button("Cancelar", role: .cancel) {}
        }
        .alert(item: $error) { error in
            Alert(title: Text("Error"), message: Text(error.mensaje), dismissButton: .default(Text("Entendido")))
        }
        .alert("Listo", isPresented: Binding(
            get: { mensajeExito != nil },
            set: { if !$0 { mensajeExito = nil } }
        )) {
            Button("OK") { mensajeExito = nil }
        } message: {
            Text(mensajeExito ?? "")
        }
    }

    private var regionDetalle: MKCoordinateRegion {
        MKCoordinateRegion(
            center: propiedad.coordenada,
            span: MKCoordinateSpan(latitudeDelta: 0.003, longitudeDelta: 0.003)
        )
    }

    private func grabarEtiqueta() async {
        do {
            let serial = try await servicioNFC.escribir(propiedad.payloadNFC)
            propiedad.registrarEscrituraNFC(serial: serial)
            guardar()
            mensajeExito = "Etiqueta grabada (serial \(serial)) y propiedad marcada como activa."
        } catch let fallo as ErrorNFC {
            guard !fallo.esSilencioso else { return }
            error = ErrorPresentable(mensaje: fallo.errorDescription ?? "Error al grabar")
        } catch {
            self.error = ErrorPresentable(mensaje: error.localizedDescription)
        }
    }

    private func bloquearEtiqueta() async {
        do {
            // Si la ficha ya tiene serial, la sesión lo exige antes de leer
            // un solo byte NDEF: no se bloquean clones ni chips sustituidos.
            let resultado = try await servicioNFC.bloquear(
                propiedad.payloadNFC,
                serialEsperado: propiedad.etiquetaSerial
            )
            propiedad.adoptarSerialNFC(resultado.serial)
            propiedad.registrarBloqueoNFC()
            guardar()
            mensajeExito = resultado.yaEstaba
                ? "La etiqueta ya estaba bloqueada; se registró en la ficha."
                : "Etiqueta bloqueada de forma permanente."
        } catch let fallo as ErrorNFC {
            guard !fallo.esSilencioso else { return }
            error = ErrorPresentable(mensaje: fallo.errorDescription ?? "Error al bloquear")
        } catch {
            self.error = ErrorPresentable(mensaje: error.localizedDescription)
        }
    }

    private func reubicar() async {
        do {
            let fix = try await ubicacion.capturar()
            // Auditoría: se conserva el valor anterior en texto plano antes
            // de sobrescribir. Sin esto, un error de campo es irreversible.
            let anterior = String(
                format: "[%@] Reubicada desde %.7f, %.7f (±%.0f m)",
                Date.now.formatted(date: .numeric, time: .shortened),
                propiedad.latitud, propiedad.longitud, propiedad.precisionHorizontal
            )
            propiedad.reubicar(a: fix, nota: anterior)
            guardar()
            mensajeExito = String(format: "Posición actualizada con ±%.1f m de precisión.", fix.horizontalAccuracy)
        } catch is CancellationError {
            return
        } catch {
            self.error = ErrorPresentable(mensaje: error.localizedDescription)
        }
    }

    private func guardar() {
        propiedad.actualizadoEn = .now
        do {
            try contexto.save()
        } catch {
            self.error = ErrorPresentable(mensaje: "No se pudo guardar: \(error.localizedDescription)")
        }
    }
}
