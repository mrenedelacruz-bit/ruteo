import Foundation
import SwiftData
import CoreLocation

/// Estado del ciclo de vida de una propiedad en campo.
///
/// Se persiste como `String` crudo y no como enum directo a propósito:
/// `#Predicate` de SwiftData no puede filtrar por propiedades computadas,
/// y un raw value textual sobrevive a los renombrados de casos sin migración.
enum EstadoPropiedad: String, CaseIterable, Codable, Sendable {
    case borrador       // capturada, sin validar
    case activa         // validada y con etiqueta escrita
    case sinEtiqueta    // validada, pendiente de grabar NFC
    case baja           // retirada del inventario

    var titulo: String {
        switch self {
        case .borrador:    return "Borrador"
        case .activa:      return "Activa"
        case .sinEtiqueta: return "Sin etiqueta"
        case .baja:        return "Baja"
        }
    }
}

@Model
final class Propiedad {

    // MARK: - Identidad
    //
    // `id` es la clave que se graba en la etiqueta NFC. Es la única cosa
    // que viaja en el tag, así que NO puede cambiar nunca una vez escrita:
    // reescribir el id deja huérfanas todas las etiquetas ya grabadas.
    @Attribute(.unique) var id: UUID

    /// Código legible por humanos (rotulado físico, expediente, etc.).
    var codigo: String
    var nombre: String

    // MARK: - Geometría
    //
    // Latitud y longitud se guardan como dos Double separados y no como un
    // tipo compuesto: SwiftData no persiste `CLLocationCoordinate2D` y este
    // desglose permite filtrar por bounding box directamente en #Predicate.
    var latitud: Double
    var longitud: Double

    /// Precisión horizontal en metros reportada por CoreLocation al capturar.
    /// Se conserva porque un punto con ±65 m no vale lo mismo que uno con ±4 m.
    var precisionHorizontal: Double
    var altitud: Double?

    // MARK: - Trazabilidad
    var capturadoEn: Date
    var actualizadoEn: Date
    var notas: String

    // MARK: - Vínculo NFC
    /// Reservado. Solo se puede poblar con `NFCTagReaderSession`; en modo
    /// NDEF puro Apple no expone el UID de la etiqueta. Ver README.
    var etiquetaSerial: String?
    var etiquetaEscritaEn: Date?

    /// Backing store del estado. No usar directamente: usar `estado`.
    var estadoRaw: String

    init(
        id: UUID = UUID(),
        codigo: String,
        nombre: String,
        latitud: Double,
        longitud: Double,
        precisionHorizontal: Double,
        altitud: Double? = nil,
        capturadoEn: Date = .now,
        notas: String = "",
        estado: EstadoPropiedad = .borrador
    ) {
        self.id = id
        self.codigo = codigo
        self.nombre = nombre
        self.latitud = latitud
        self.longitud = longitud
        self.precisionHorizontal = precisionHorizontal
        self.altitud = altitud
        self.capturadoEn = capturadoEn
        self.actualizadoEn = capturadoEn
        self.notas = notas
        self.etiquetaSerial = nil
        self.etiquetaEscritaEn = nil
        self.estadoRaw = estado.rawValue
    }
}

// MARK: - Propiedades derivadas
//
// Van en extensión y no en el cuerpo de la clase: el macro @Model solo
// procesa el cuerpo, así que aquí no hay riesgo de que intente persistirlas.
extension Propiedad {

    var estado: EstadoPropiedad {
        get { EstadoPropiedad(rawValue: estadoRaw) ?? .borrador }
        set { estadoRaw = newValue.rawValue }
    }

    var coordenada: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitud, longitude: longitud)
    }

    /// Payload que se graba en la etiqueta física.
    var payloadNFC: PayloadPropiedad {
        PayloadPropiedad(id: id, codigo: codigo)
    }

    /// Marca la propiedad como recién escrita en una etiqueta.
    func registrarEscrituraNFC(en fecha: Date = .now) {
        etiquetaEscritaEn = fecha
        estado = .activa
        actualizadoEn = fecha
    }

    /// Reposiciona la propiedad conservando auditoría del cambio.
    func reubicar(a ubicacion: CLLocation, nota: String? = nil) {
        latitud = ubicacion.coordinate.latitude
        longitud = ubicacion.coordinate.longitude
        precisionHorizontal = ubicacion.horizontalAccuracy
        altitud = ubicacion.verticalAccuracy >= 0 ? ubicacion.altitude : nil
        actualizadoEn = .now
        if let nota, !nota.isEmpty {
            notas = notas.isEmpty ? nota : notas + "\n" + nota
        }
    }
}
