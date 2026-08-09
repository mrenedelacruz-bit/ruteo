import Foundation
import CoreNFC

enum ErrorNFC: LocalizedError, Equatable {
    /// El dispositivo no tiene lector NFC o iOS lo tiene deshabilitado.
    case noDisponible
    /// El usuario cerró la hoja del sistema o agotó el tiempo.
    case cancelado
    case conexionFallida(String)
    case lecturaFallida(String)
    case escrituraFallida(String)
    /// La etiqueta está en blanco (sin mensaje NDEF).
    case etiquetaVacia
    /// La etiqueta tiene NDEF pero no es de esta app.
    case etiquetaAjena
    /// La etiqueta fue bloqueada (read-only) y ya no admite escritura.
    case etiquetaSoloLectura
    /// La etiqueta no está formateada como NDEF.
    case etiquetaNoFormateada
    case capacidadInsuficiente(requerido: Int, disponible: Int)
    case payloadInvalido(String)
    case checksumInvalido(esperado: UInt8, leido: UInt8)
    case versionNoSoportada(Int)
    case variasEtiquetas
    /// La etiqueta acercada no corresponde a la propiedad en pantalla.
    /// Existe para impedir bloqueos permanentes sobre la etiqueta equivocada.
    case etiquetaNoCoincide(esperada: String, leida: String)
    /// El chip no admite el comando de bloqueo por software.
    case bloqueoNoSoportado(String)

    var errorDescription: String? {
        switch self {
        case .noDisponible:
            return "Este dispositivo no admite lectura NFC. Core NFC requiere iPhone 7 o superior y no funciona en el simulador."
        case .cancelado:
            return "Lectura cancelada."
        case .conexionFallida(let detalle):
            return "No se pudo conectar con la etiqueta: \(detalle)"
        case .lecturaFallida(let detalle):
            return "Fallo al leer la etiqueta: \(detalle)"
        case .escrituraFallida(let detalle):
            return "Fallo al grabar la etiqueta: \(detalle)"
        case .etiquetaVacia:
            return "La etiqueta está en blanco. Grábala desde el detalle de la propiedad."
        case .etiquetaAjena:
            return "La etiqueta tiene datos, pero no pertenecen a esta aplicación."
        case .etiquetaSoloLectura:
            return "La etiqueta está bloqueada de forma permanente y no admite regrabación."
        case .etiquetaNoFormateada:
            return "La etiqueta no está formateada como NDEF."
        case .capacidadInsuficiente(let requerido, let disponible):
            return "La etiqueta no tiene capacidad suficiente: se necesitan \(requerido) bytes y solo hay \(disponible)."
        case .payloadInvalido(let detalle):
            return "Contenido de etiqueta inválido. \(detalle)"
        case .checksumInvalido(let esperado, let leido):
            return String(format: "Checksum incorrecto (esperado %02X, leído %02X). La grabación quedó incompleta: vuelve a grabar la etiqueta.", esperado, leido)
        case .versionNoSoportada(let version):
            return "La etiqueta usa el formato v\(version), más reciente que el que soporta esta versión de la app. Actualiza la app."
        case .variasEtiquetas:
            return "Se detectó más de una etiqueta. Separa las etiquetas y vuelve a acercar solo una."
        case .etiquetaNoCoincide(let esperada, let leida):
            return "La etiqueta acercada pertenece a «\(leida)», no a «\(esperada)». No se bloqueó nada."
        case .bloqueoNoSoportado(let detalle):
            return "Este chip no admite bloqueo por comando: \(detalle). La etiqueta queda intacta."
        }
    }
}

extension ErrorNFC {
    /// Traduce los códigos de `NFCReaderError` a nuestro dominio.
    /// La cancelación del usuario y el timeout no son fallos reales:
    /// no deben mostrarse como alerta de error en la UI.
    static func desde(_ error: Error) -> ErrorNFC {
        guard let lector = error as? NFCReaderError else {
            return .lecturaFallida(error.localizedDescription)
        }
        switch lector.code {
        case .readerSessionInvalidationErrorUserCanceled,
             .readerSessionInvalidationErrorSessionTimeout:
            return .cancelado
        case .readerSessionInvalidationErrorSystemIsBusy:
            return .lecturaFallida("El sistema NFC está ocupado. Espera unos segundos y reintenta.")
        case .ndefReaderSessionErrorTagNotWritable:
            return .etiquetaSoloLectura
        case .ndefReaderSessionErrorTagSizeTooSmall:
            return .capacidadInsuficiente(requerido: 0, disponible: 0)
        case .ndefReaderSessionErrorTagUpdateFailure:
            return .escrituraFallida("La etiqueta se retiró durante la grabación.")
        default:
            return .lecturaFallida(lector.localizedDescription)
        }
    }

    /// `true` cuando el error no amerita alerta (el usuario ya sabe qué pasó).
    var esSilencioso: Bool { self == .cancelado }
}
