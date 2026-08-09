import Foundation
import CoreNFC

/// Resultado de leer una etiqueta: el payload lógico + el serial físico.
struct LecturaNFC {
    let payload: PayloadPropiedad
    /// UID de fábrica del chip en hexadecimal (`Data.serialHex`).
    /// Grabado en silicio por el fabricante: un clon NDEF barato copia el
    /// payload pero no puede replicar este serial.
    let serial: String
}

/// Fachada async/await sobre Core NFC.
///
/// Usa `NFCTagReaderSession` (no `NFCNDEFReaderSession`) porque es la única
/// vía que expone el UID físico del chip. Los cuatro tipos de tag que
/// entrega la sesión conforman `NFCNDEFTag`, así que la lógica NDEF
/// (leer/escribir/bloquear) es la misma; solo cambia el arranque de sesión
/// y que ahora todo resultado viaja acompañado del serial.
@MainActor
final class ServicioNFC: ObservableObject {

    /// `false` en simulador y en iPhone sin lector. Usar para ocultar la UI
    /// de NFC en vez de dejar que el usuario toque un botón que no hará nada.
    var disponible: Bool { NFCTagReaderSession.readingAvailable }

    @Published private(set) var operacionEnCurso = false

    private var sesionActiva: SesionEtiqueta?

    /// Lee una etiqueta y devuelve payload + serial físico.
    func leer() async throws -> LecturaNFC {
        try await ejecutar(.lectura) { resultado in
            guard case .leido(let payload, let serial) = resultado else {
                throw ErrorNFC.lecturaFallida("Resultado inesperado de la sesión")
            }
            return LecturaNFC(payload: payload, serial: serial)
        }
    }

    /// Graba el payload y devuelve el serial físico de la etiqueta grabada,
    /// para persistirlo en `Propiedad.etiquetaSerial`.
    func escribir(_ payload: PayloadPropiedad) async throws -> String {
        try await ejecutar(.escritura(payload)) { resultado in
            guard case .escrito(let serial) = resultado else {
                throw ErrorNFC.lecturaFallida("Resultado inesperado de la sesión")
            }
            return serial
        }
    }

    /// Bloquea la etiqueta de forma PERMANENTE tras verificar identidad.
    /// - Parameter serialEsperado: si la propiedad ya tiene serial
    ///   registrado, la sesión exige que el chip coincida ANTES de leer
    ///   siquiera el payload — no se bloquean clones.
    /// - Returns: `yaEstaba` si el chip ya era read-only, y su serial.
    func bloquear(
        _ payload: PayloadPropiedad,
        serialEsperado: String?
    ) async throws -> (yaEstaba: Bool, serial: String) {
        try await ejecutar(.bloqueo(payload, serialEsperado: serialEsperado)) { resultado in
            guard case .bloqueado(let yaEstaba, let serial) = resultado else {
                throw ErrorNFC.lecturaFallida("Resultado inesperado de la sesión")
            }
            return (yaEstaba, serial)
        }
    }

    private func ejecutar<T>(
        _ operacion: SesionEtiqueta.Operacion,
        transformar: @escaping (SesionEtiqueta.Resultado) throws -> T
    ) async throws -> T {
        // Core NFC solo admite una sesión a la vez por proceso; un segundo
        // `begin()` concurrente invalida la primera de forma silenciosa.
        guard !operacionEnCurso else {
            throw ErrorNFC.lecturaFallida("Ya hay una sesión NFC en curso.")
        }
        guard disponible else { throw ErrorNFC.noDisponible }

        operacionEnCurso = true
        defer { operacionEnCurso = false; sesionActiva = nil }

        let sesion = SesionEtiqueta(operacion: operacion)
        sesionActiva = sesion
        return try transformar(try await sesion.ejecutar())
    }

    /// Cierra la hoja del sistema desde la app (p. ej. al salir de la vista).
    func cancelar() {
        sesionActiva?.cancelar()
    }
}

// MARK: - Sesión de un solo uso

/// Encapsula UNA operación sobre `NFCTagReaderSession`. No reutilizar:
/// cada `ejecutar()` necesita una instancia nueva porque la continuación
/// se consume una sola vez.
final class SesionEtiqueta: NSObject, @unchecked Sendable {

    enum Operacion {
        case lectura
        case escritura(PayloadPropiedad)
        /// Bloqueo permanente. Lleva el payload esperado y, si existe, el
        /// serial registrado: ambos se verifican ANTES de bloquear, porque
        /// bloquear la etiqueta equivocada (o un clon) es irreversible.
        case bloqueo(PayloadPropiedad, serialEsperado: String?)

        var mensajeInicial: String {
            switch self {
            case .lectura:   return "Acerca el iPhone a la etiqueta de la propiedad."
            case .escritura: return "Acerca el iPhone a la etiqueta que vas a grabar."
            case .bloqueo:   return "Acerca el iPhone a la etiqueta que vas a bloquear. Esta acción es permanente."
            }
        }
    }

    enum Resultado {
        case leido(PayloadPropiedad, serial: String)
        case escrito(serial: String)
        case bloqueado(yaEstaba: Bool, serial: String)
    }

    private let operacion: Operacion
    private let cola = DispatchQueue(label: "app.upgh.propiedades.nfc", qos: .userInitiated)

    // La continuación se protege con lock porque los callbacks de Core NFC
    // pueden entrar desde su cola interna mientras `ejecutar()` aún la asigna.
    private let candado = NSLock()
    private var continuacion: CheckedContinuation<Resultado, Error>?
    private var sesion: NFCTagReaderSession?

    init(operacion: Operacion) {
        self.operacion = operacion
    }

    func ejecutar() async throws -> Resultado {
        try await withCheckedThrowingContinuation { cont in
            candado.lock()
            continuacion = cont
            candado.unlock()

            // iso14443 cubre NTAG/MIFARE (Tipo A/B), iso15693 los Tipo 5.
            // No se incluye iso18092 (FeliCa): no hay despliegue previsto y
            // cada opción de polling alarga el ciclo de detección.
            guard let nueva = NFCTagReaderSession(
                pollingOption: [.iso14443, .iso15693],
                delegate: self,
                queue: cola
            ) else {
                finalizar(.failure(ErrorNFC.noDisponible))
                return
            }
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

    private func abortar(_ sesion: NFCTagReaderSession, _ error: ErrorNFC) {
        sesion.invalidate(errorMessage: error.errorDescription ?? "Error desconocido")
        finalizar(.failure(error))
    }

    private func completar(_ sesion: NFCTagReaderSession, _ resultado: Resultado, mensaje: String) {
        sesion.alertMessage = mensaje
        sesion.invalidate()
        finalizar(.success(resultado))
    }

    /// Extrae de un `NFCTag` el serial físico y su vista NDEF.
    /// Todos los casos de tag de Core NFC conforman `NFCNDEFTag`, por eso
    /// la lógica NDEF aguas abajo no distingue el tipo de chip.
    private static func desglosar(_ tag: NFCTag) -> (serial: String, ndef: NFCNDEFTag)? {
        switch tag {
        case .miFare(let t):   return (t.identifier.serialHex, t)
        case .iso15693(let t): return (t.identifier.serialHex, t)
        case .iso7816(let t):  return (t.identifier.serialHex, t)
        case .feliCa(let t):   return (t.currentIDm.serialHex, t)
        @unknown default:      return nil
        }
    }
}

// MARK: - NFCTagReaderSessionDelegate

extension SesionEtiqueta: NFCTagReaderSessionDelegate {

    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        // Llega tanto en cancelación del usuario como tras `invalidate()`
        // propio. Si la continuación ya se consumió, `finalizar` no hace nada.
        finalizar(.failure(ErrorNFC.desde(error)))
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard tags.count == 1, let tag = tags.first else {
            // No se invalida: se pide al usuario separar las etiquetas y
            // se reanuda el polling para no obligarle a reabrir la hoja.
            session.alertMessage = ErrorNFC.variasEtiquetas.errorDescription ?? ""
            session.restartPolling()
            return
        }

        session.connect(to: tag) { [weak self] error in
            guard let self else { return }
            if let error {
                self.abortar(session, .conexionFallida(error.localizedDescription))
                return
            }
            guard let (serial, ndef) = Self.desglosar(tag) else {
                self.abortar(session, .lecturaFallida("Tipo de etiqueta no reconocido"))
                return
            }

            // Verificación anti-clonación más barata posible: el serial se
            // conoce nada más conectar, antes de leer un solo byte NDEF.
            if case .bloqueo(_, let serialEsperado) = self.operacion,
               let esperado = serialEsperado, esperado != serial {
                self.abortar(session, .serialNoCoincide(esperado: esperado, leido: serial))
                return
            }

            ndef.queryNDEFStatus { estado, capacidad, error in
                if let error {
                    self.abortar(session, .lecturaFallida(error.localizedDescription))
                    return
                }
                switch self.operacion {
                case .lectura:
                    self.leer(ndef, serial: serial, estado: estado, session: session)
                case .escritura(let payload):
                    self.escribir(payload, en: ndef, serial: serial, estado: estado, capacidad: capacidad, session: session)
                case .bloqueo(let esperado, _):
                    self.bloquear(esperado, en: ndef, serial: serial, estado: estado, session: session)
                }
            }
        }
    }

    // MARK: Operaciones

    private func leer(_ etiqueta: NFCNDEFTag, serial: String, estado: NFCNDEFStatus, session: NFCTagReaderSession) {
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
                self.completar(session, .leido(payload, serial: serial), mensaje: "Propiedad identificada.")
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
        serial: String,
        estado: NFCNDEFStatus,
        capacidad: Int,
        session: NFCTagReaderSession
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
            self.completar(session, .escrito(serial: serial), mensaje: "Etiqueta grabada correctamente.")
        }
    }

    /// Bloqueo permanente con verificación previa de identidad.
    ///
    /// Secuencia: serial (ya verificado en `didDetect`) → leer →
    /// decodificar → comparar UUID → writeLock. Si cualquier paso falla,
    /// la etiqueta queda intacta. Un `readOnly` con el UUID correcto se
    /// trata como éxito idempotente, no como error: en campo es común
    /// reintentar un bloqueo que sí llegó a aplicarse.
    private func bloquear(
        _ esperado: PayloadPropiedad,
        en etiqueta: NFCNDEFTag,
        serial: String,
        estado: NFCNDEFStatus,
        session: NFCTagReaderSession
    ) {
        guard estado != .notSupported else {
            abortar(session, .etiquetaNoFormateada)
            return
        }

        etiqueta.readNDEF { [weak self] mensaje, error in
            guard let self else { return }
            if error != nil, mensaje == nil {
                self.abortar(session, .etiquetaVacia)
                return
            }
            guard let mensaje, !mensaje.records.isEmpty else {
                self.abortar(session, .etiquetaVacia)
                return
            }

            let leido: PayloadPropiedad
            do {
                leido = try PayloadPropiedad.decodificar(mensaje)
            } catch let error as ErrorNFC {
                self.abortar(session, error)
                return
            } catch {
                self.abortar(session, .lecturaFallida(error.localizedDescription))
                return
            }

            // La comparación es por UUID, no por código: el registro URI de
            // respaldo no transporta código y seguiría siendo la misma etiqueta.
            guard leido.id == esperado.id else {
                self.abortar(session, .etiquetaNoCoincide(
                    esperada: esperado.codigo,
                    leida: leido.codigo.isEmpty ? leido.id.uuidString : leido.codigo
                ))
                return
            }

            if estado == .readOnly {
                self.completar(session, .bloqueado(yaEstaba: true, serial: serial), mensaje: "La etiqueta ya estaba bloqueada.")
                return
            }

            etiqueta.writeLock { error in
                if let error {
                    self.abortar(session, .bloqueoNoSoportado(error.localizedDescription))
                    return
                }
                self.completar(session, .bloqueado(yaEstaba: false, serial: serial), mensaje: "Etiqueta bloqueada de forma permanente.")
            }
        }
    }
}
