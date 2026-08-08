import Foundation

/// Exportación a GeoJSON (RFC 7946) para consumo en BI / QGIS / Leaflet.
///
/// REGLAS NO NEGOCIABLES DEL FORMATO:
///
///  1. `coordinates` es **[longitud, latitud]**, en ese orden. Es el error
///     número uno al integrar GeoJSON: el resto del mundo dice "lat, lon" y
///     el estándar dice lo contrario. Invertirlo manda todas las propiedades
///     de RD al golfo de Guinea sin que nada falle visiblemente.
///  2. Las claves se emiten en orden fijo. Se codifica a mano, sin
///     `JSONEncoder`, porque el orden de claves sintetizado no está
///     garantizado y las pruebas comparan bytes exactos.
///  3. Las coordenadas se redondean a 7 decimales (~1,1 cm). Sin redondeo,
///     el ruido de coma flotante genera diffs espurios en cada exportación.
enum ExportadorGeoJSON {

    static let decimalesCoordenada = 7

    private static let formateadorFecha: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]   // sin fracciones: estable entre corridas
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()

    /// Genera un `FeatureCollection` completo.
    /// - Parameter propiedades: se exportan en el orden recibido; ordenar
    ///   antes de llamar si se necesita un criterio concreto.
    static func featureCollection(_ propiedades: [Propiedad]) -> Data {
        var salida = #"{"type":"FeatureCollection","features":["#
        salida += propiedades.map(feature(_:)).joined(separator: ",")
        salida += "]}"
        return Data(salida.utf8)
    }

    static func feature(_ propiedad: Propiedad) -> String {
        var partes: [String] = []
        partes.append(#""type":"Feature""#)
        partes.append(#""id":"\#(propiedad.id.uuidString)""#)
        partes.append(#""geometry":\#(geometria(propiedad))"#)
        partes.append(#""properties":\#(propiedades(propiedad))"#)
        return "{" + partes.joined(separator: ",") + "}"
    }

    private static func geometria(_ propiedad: Propiedad) -> String {
        // Orden obligatorio: longitud, latitud [, altitud].
        var componentes = [
            numero(propiedad.longitud, decimales: decimalesCoordenada),
            numero(propiedad.latitud, decimales: decimalesCoordenada)
        ]
        if let altitud = propiedad.altitud {
            componentes.append(numero(altitud, decimales: 2))
        }
        return #"{"type":"Point","coordinates":[\#(componentes.joined(separator: ","))]}"#
    }

    private static func propiedades(_ propiedad: Propiedad) -> String {
        // Orden de columnas congelado: cualquier consumidor de BI que mapee
        // por posición se rompe si se reordena o se elimina una clave.
        var partes: [String] = []
        partes.append(#""codigo":\#(texto(propiedad.codigo))"#)
        partes.append(#""nombre":\#(texto(propiedad.nombre))"#)
        partes.append(#""estado":\#(texto(propiedad.estado.rawValue))"#)
        partes.append(#""precision_m":\#(numero(propiedad.precisionHorizontal, decimales: 1))"#)
        partes.append(#""capturado_en":\#(texto(formateadorFecha.string(from: propiedad.capturadoEn)))"#)
        partes.append(#""actualizado_en":\#(texto(formateadorFecha.string(from: propiedad.actualizadoEn)))"#)
        partes.append(#""etiqueta_escrita_en":\#(propiedad.etiquetaEscritaEn.map { texto(formateadorFecha.string(from: $0)) } ?? "null")"#)
        partes.append(#""etiqueta_serial":\#(propiedad.etiquetaSerial.map(texto) ?? "null")"#)
        partes.append(#""notas":\#(texto(propiedad.notas))"#)
        return "{" + partes.joined(separator: ",") + "}"
    }

    // MARK: - Primitivas

    /// Redondeo determinista y sin notación científica ni separador local.
    /// `String(format:)` con `%.*f` usa siempre el locale POSIX aquí porque
    /// se llama sin `Locale`, que es justo lo que se necesita para JSON.
    static func numero(_ valor: Double, decimales: Int) -> String {
        guard valor.isFinite else { return "null" }
        var texto = String(format: "%.\(decimales)f", valor)
        // Se recortan ceros finales para no inflar el archivo, conservando
        // al menos un decimal para que el tipo siga leyéndose como número.
        if texto.contains(".") {
            while texto.hasSuffix("0") { texto.removeLast() }
            if texto.hasSuffix(".") { texto += "0" }
        }
        return texto == "-0.0" ? "0.0" : texto
    }

    static func texto(_ valor: String) -> String {
        var salida = "\""
        for caracter in valor.unicodeScalars {
            switch caracter {
            case "\"":  salida += "\\\""
            case "\\":  salida += "\\\\"
            case "\n":  salida += "\\n"
            case "\r":  salida += "\\r"
            case "\t":  salida += "\\t"
            default:
                if caracter.value < 0x20 {
                    salida += String(format: "\\u%04X", caracter.value)
                } else {
                    salida.unicodeScalars.append(caracter)
                }
            }
        }
        return salida + "\""
    }
}

// MARK: - Escritura a disco

extension ExportadorGeoJSON {

    /// Escribe el archivo en el directorio temporal y devuelve su URL,
    /// lista para `ShareLink` o para el proveedor de documentos.
    static func escribirArchivo(_ propiedades: [Propiedad], nombre: String = "propiedades") throws -> URL {
        let marca = formateadorFecha.string(from: .now)
            .replacingOccurrences(of: ":", with: "")
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(nombre)-\(marca).geojson")
        try featureCollection(propiedades).write(to: url, options: .atomic)
        return url
    }
}
