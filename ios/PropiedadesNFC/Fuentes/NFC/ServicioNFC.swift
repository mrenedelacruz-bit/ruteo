import Foundation
import CoreNFC

/// Fachada async/await sobre Core NFC.
///
/// Core NFC es 100 % callback-based y sus delegados llegan en una cola
/// privada. Se aísla toda esa mecánica en `SesionNDEF` (una sesión = un
/// objeto = una continuación) para que la capa de vistas solo vea
/// `try await servicio.leer()`.
@MainActor
final class ServicioNFC: ObservableObject {

    /// `false` en simulador y en iPhone sin lector. Usar para ocultar la UI
    /// de NFC en vez de dejar que el usuario toque un botón que no hará nada.
    var disponible: Bool { NFCNDEFReaderSession.readingAvailable }

    @Published private(set) var operacionEnCurso = false

    private var sesionActiva: SesionNDEF?

    /// Lee una etiqueta y devuelve el payload de la propiedad.
    func leer() async throws -> PayloadPropiedad {
        try await ejecutar(.lectura) { resultado in
            guard case .leido(let payload) = resultado else {
                throw ErrorNFC.lecturaFallida("Resultado inesperado de la sesión")
            }
            return payload
        }
    }

    /// Graba el payload en una etiqueta en blanco o regrabable.
    func escribir(_ payload: PayloadPropiedad) async throws {
        _ = try await ejecutar(.escritura(payload)) { _ in () }
    }

    private func ejecutar<T>(
        _ operacion: SesionNDEF.Operacion,
        transformar: @escaping (SesionNDEF.Resultado) throws -> T
    ) async throws -> T {
        // Core NFC solo admite una sesión a la vez por proceso; un segundo
        // `begin()` concurrente invalida la primera de forma silenciosa.
        guard !operacionEnCurso else {
            throw ErrorNFC.lecturaFallida("Ya hay una sesión NFC en curso.")
        }
        guard disponible else { throw ErrorNFC.noDisponible }

        operacionEnCurso = true
        defer { operacionEnCurso = false; sesionActiva = nil }

        let sesion = SesionNDEF(operacion: operacion)
        sesionActiva = sesion
        return try transformar(try await sesion.ejecutar())
    }

    /// Cierra la hoja del sistema desde la app (p. ej. al salir de la vista).
    func cancelar() {
        sesionActiva?.cancelar()
    }
}

// MARK: - Sesión de un solo uso

/// Encapsula UNA operación NDEF. No reutilizar: cada `ejecutar()` necesita
/// una instancia nueva porque la continuación se consume una sola vez.
final class SesionNDEF: NSObject, @unchecked Sendable {

    enum Operacion {
        case lectura
        case escritura(PayloadPropiedad)

        var mensajeInicial: String {
            switch self {
            case .lectura:   return "Acerca el iPhone a la etiqueta de la propiedad."
            case .escritura: return "Acerca el iPhone a la etiqueta que vas a grabar."
            }
        }
    }

    enum Resultado {
        case leido(PayloadPropiedad)
        case escrito
    }

    private let operacion: Operacion
    private let cola = DispatchQueue(label: "app.upgh.propiedades.nfc", qos: .userInitiated)

    // La continuación se protege con lock porque los callbacks de Core NFC
    // pueden entrar desde su cola interna mientras `ejecutar()` aún la asigna.
    private let candado = NSLock()
    private var continuacion: CheckedContinuation<Resultado, Error>?
    private var sesion: NFCNDEFReaderSession?

    init(operacion: Operacion) {
        self.operacion = operacion
    }

    func ejecutar() async throws -> Resultado {
        try await withCheckedThrowingContinuation { cont in
            candado.lock()
            continuacion = cont
            candado.unlock()

            // invalidateAfterFirstRead: false es obligatorio incluso para
            // lectura: con `true` iOS no entrega `didDetect tags:` y no se
            // puede consultar el estado NDEF antes de leer.
            let nueva = NFCNDEFReaderSession(delegate: self, queue: cola, invalidateAfterFirstRead: false)
            nueva.alertMessage = operacion.mensajeInicial
            sesion = nueva
            nueva.begin()
        }
    }

    func cancelar() {
        sesion?.invalidate()
    }

    /// Resuelve la continuación garantizando una única llamada.
    /// Reanudar dos veces una CheckedContinuation es crash inmediato.
    private func finalizar(_ resultado: Result<Resultado, Error>) {
        candado.lock()
        let pendiente = continuacion
        continuacion = nil
        candado.unlock()
        pendiente?.resume(with: resultado)
    }

    private func abortar(_ sesion: NFCNDEFReaderSession, _ error: ErrorNFC) {
        sesion.invalidate(errorMessage: error.errorDescription ?? "Error desconocido")
        finalizar(.failure(error))
    }

    private func completar(_ sesion: NFCNDEFReaderSession, _ resultado: Resultado, mensaje: String) {
        sesion.alertMessage = mensaje
        sesion.invalidate()
        finalizar(.success(resultado))
    }
}

// MARK: - NFCNDEFReaderSessionDelegate

extension SesionNDEF: NFCNDEFReaderSessionDelegate {

    /// Obligatorio por protocolo, pero nunca se invoca con
    /// `invalidateAfterFirstRead: false`. Toda la lógica vive en `didDetect tags:`.
    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {}

    func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
        guard tags.count == 1, let etiqueta = tags.first else {
            // No se invalida: se pide al usuario separar las etiquetas y
            // se reanuda el polling para no obligarle a reabrir la hoja.
            session.alertMessage = ErrorNFC.variasEtiquetas.errorDescription ?? ""
            session.restartPolling()
            return
        }

        session.connect(to: etiqueta) { [weak self] error in
            guard let self else { return }
            if let error {
                self.abortar(session, .conexionFallida(error.localizedDescription))
                return
            }

            etiqueta.queryNDEFStatus { estado, capacidad, error in
                if let error {
                    self.abortar(session, .lecturaFallida(error.localizedDescription))
                    return
                }
                switch self.operacion {
                case .lectura:
                    self.leer(etiqueta, estado: estado, session: session)
                case .escritura(let payload):
                    self.escribir(payload, en: etiqueta, estado: estado, capacidad: capacidad, session: session)
                }
            }
        }
    }

    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        // Llega tanto en cancelación del usuario como tras `invalidate()`
        // propio. Si la continuación ya se consumió, `finalizar` no hace nada.
        finalizar(.failure(ErrorNFC.desde(error)))
    }

    // MARK: Operaciones

    private func leer(_ etiqueta: NFCNDEFTag, estado: NFCNDEFStatus, session: NFCNDEFReaderSession) {
        guard estado != .notSupported else {
            abortar(session, .etiquetaNoFormateada)
            return
        }

        etiqueta.readNDEF { [weak self] mensaje, error in
            guard let self else { return }
            if let error {
                // Una etiqueta formateada pero vacía devuelve error en algunos
                // chips: se distingue por no traer mensaje.
                self.abortar(session, mensaje == nil ? .etiquetaVacia : .lecturaFallida(error.localizedDescription))
                return
            }
            guard let mensaje, !mensaje.records.isEmpty else {
                self.abortar(session, .etiquetaVacia)
                return
            }
            do {
                let payload = try PayloadPropiedad.decodificar(mensaje)
                self.completar(session, .leido(payload), mensaje: "Propiedad identificada.")
            } catch let error as ErrorNFC {
                self.abortar(session, error)
            } catch {
                self.abortar(session, .lecturaFallida(error.localizedDescription))
            }
        }
    }

    private func escribir(
        _ payload: PayloadPropiedad,
        en etiqueta: NFCNDEFTag,
        estado: NFCNDEFStatus,
        capacidad: Int,
        session: NFCNDEFReaderSession
    ) {
        switch estado {
        case .notSupported:
            abortar(session, .etiquetaNoFormateada)
            return
        case .readOnly:
            abortar(session, .etiquetaSoloLectura)
            return
        case .readWrite:
            break
        @unknown default:
            abortar(session, .escrituraFallida("Estado de etiqueta desconocido"))
            return
        }

        let mensaje: NFCNDEFMessage
        do {
            mensaje = try payload.mensajeNDEF()
        } catch let error as ErrorNFC {
            abortar(session, error)
            return
        } catch {
            abortar(session, .escrituraFallida(error.localizedDescription))
            return
        }

        // Verificación previa: escribir sin comprobar capacidad deja la
        // etiqueta con un mensaje truncado que sí pasa como NDEF válido.
        guard mensaje.length <= capacidad else {
            abortar(session, .capacidadInsuficiente(requerido: mensaje.length, disponible: capacidad))
            return
        }

        etiqueta.writeNDEF(mensaje) { [weak self] error in
            guard let self else { return }
            if let error {
                self.abortar(session, .escrituraFallida(error.localizedDescription))
                return
            }
            self.completar(session, .escrito, mensaje: "Etiqueta grabada correctamente.")
        }
    }
}
