import Foundation

/// Resultado de una importación: qué entró, qué se omitió y por qué.
/// Nunca se importa "a medias" en silencio — todo descarte queda contado.
struct ResultadoImportacion {
    var nuevas: [Propiedad] = []
    var duplicadas = 0
    var errores: [String] = []

    var resumen: String {
        var partes = ["\(nuevas.count) importada(s)"]
        if duplicadas > 0 { partes.append("\(duplicadas) duplicada(s) omitida(s)") }
        if !errores.isEmpty { partes.append("\(errores.count) con errores") }
        var texto = partes.joined(separator: ", ") + "."
        if !errores.isEmpty {
            texto += "\n" + errores.prefix(5).joined(separator: "\n")
            if errores.count > 5 { texto += "\n…y \(errores.count - 5) más." }
        }
        return texto
    }
}

enum ErrorImportacion: LocalizedError {
    case noEsJSON
    case noEsFeatureCollection

    var errorDescription: String? {
        switch self {
        case .noEsJSON:
            return "El archivo no contiene JSON válido."
        case .noEsFeatureCollection:
            return "El archivo no es un FeatureCollection GeoJSON. Se aceptan solo colecciones de puntos."
        }
    }
}

/// Importación de un `FeatureCollection` GeoJSON (RFC 7946).
///
/// Reglas de validación, en orden de aplicación por feature:
///  1. Geometría `Point` con `coordinates` = [longitud, latitud] y rangos
///     válidos (lon ∈ [-180, 180], lat ∈ [-90, 90]).
///  2. `properties.codigo` no vacío — sin código no hay propiedad.
///  3. `id` de feature como UUID; si falta se genera (y entonces no hay
///     dedupe posible contra futuras reimportaciones del mismo archivo).
///  4. Un `id` ya existente en la base o repetido dentro del archivo se
///     OMITE, nunca se sobreescribe: los datos corregidos en campo mandan
///     sobre cualquier dataset importado.
enum ImportadorGeoJSON {

    /// Sentinela para "precisión no informada por el dataset".
    /// Mismo convenio que CoreLocation: precisión negativa = inválida.
    static let precisionDesconocida: Double = -1

    private static let formateadorFecha: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let formateadorFechaConFracciones: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// - Parameters:
    ///   - datos: contenido del archivo .geojson.
    ///   - existentes: UUIDs ya presentes en la base local, para dedupe.
    /// - Returns: propiedades nuevas listas para insertar + reporte.
    /// - Throws: solo si el archivo entero es inservible; los errores por
    ///   feature individual se acumulan en el reporte.
    static func importar(_ datos: Data, existentes: Set<UUID>) throws -> ResultadoImportacion {
        guard let raiz = try? JSONSerialization.jsonObject(with: datos) as? [String: Any] else {
            throw ErrorImportacion.noEsJSON
        }
        guard raiz["type"] as? String == "FeatureCollection",
              let features = raiz["features"] as? [[String: Any]] else {
            throw ErrorImportacion.noEsFeatureCollection
        }

        var resultado = ResultadoImportacion()
        // Incluye los ids del propio archivo: un dataset con features
        // duplicadas internamente también debe deduplicarse.
        var vistos = existentes

        for (indice, feature) in features.enumerated() {
            switch procesar(feature, indice: indice, vistos: vistos) {
            case .success(let propiedad):
                vistos.insert(propiedad.id)
                resultado.nuevas.append(propiedad)
            case .failure(.duplicada):
                resultado.duplicadas += 1
            case .failure(.invalida(let motivo)):
                resultado.errores.append("Feature \(indice): \(motivo)")
            }
        }
        return resultado
    }

    private enum FalloFeature: Error {
        case duplicada
        case invalida(String)
    }

    private static func procesar(
        _ feature: [String: Any],
        indice: Int,
        vistos: Set<UUID>
    ) -> Result<Propiedad, FalloFeature> {
        // 1. Geometría
        guard let geometria = feature["geometry"] as? [String: Any],
              geometria["type"] as? String == "Point",
              let crudas = geometria["coordinates"] as? [Any] else {
            return .failure(.invalida("la geometría no es un Point con coordinates"))
        }
        let coordenadas = crudas.compactMap { ($0 as? NSNumber)?.doubleValue }
        guard coordenadas.count == crudas.count, (2...3).contains(coordenadas.count) else {
            return .failure(.invalida("coordinates debe tener 2 o 3 números"))
        }

        // GeoJSON manda: [0] longitud, [1] latitud. NO invertir.
        let longitud = coordenadas[0]
        let latitud = coordenadas[1]
        let altitud = coordenadas.count == 3 ? coordenadas[2] : nil

        guard (-180.0...180.0).contains(longitud) else {
            return .failure(.invalida("longitud \(longitud) fuera de rango [-180, 180]"))
        }
        guard (-90.0...90.0).contains(latitud) else {
            return .failure(.invalida("latitud \(latitud) fuera de rango [-90, 90] — ¿coordenadas invertidas?"))
        }

        // 2. Propiedades mínimas
        let props = feature["properties"] as? [String: Any] ?? [:]
        guard let codigo = (props["codigo"] as? String)?.trimmingCharacters(in: .whitespaces),
              !codigo.isEmpty else {
            return .failure(.invalida("falta properties.codigo"))
        }

        // 3. Identidad
        let id: UUID
        if let idTexto = feature["id"] as? String {
            guard let parseado = UUID(uuidString: idTexto) else {
                return .failure(.invalida("id '\(idTexto)' no es un UUID"))
            }
            id = parseado
        } else {
            id = UUID()
        }

        // 4. Dedupe: lo capturado/corregido en campo manda sobre el archivo.
        guard !vistos.contains(id) else { return .failure(.duplicada) }

        let estadoTexto = props["estado"] as? String ?? EstadoPropiedad.borrador.rawValue
        let estado = EstadoPropiedad(rawValue: estadoTexto) ?? .borrador

        let propiedad = Propiedad(
            id: id,
            codigo: codigo,
            nombre: (props["nombre"] as? String) ?? "",
            latitud: latitud,
            longitud: longitud,
            precisionHorizontal: (props["precision_m"] as? NSNumber)?.doubleValue ?? precisionDesconocida,
            altitud: altitud,
            capturadoEn: fecha(props["capturado_en"]) ?? .now,
            notas: (props["notas"] as? String) ?? "",
            estado: estado
        )
        if let escrita = fecha(props["etiqueta_escrita_en"]) {
            propiedad.etiquetaEscritaEn = escrita
        }
        return .success(propiedad)
    }

    private static func fecha(_ valor: Any?) -> Date? {
        guard let texto = valor as? String else { return nil }
        return formateadorFecha.date(from: texto)
            ?? formateadorFechaConFracciones.date(from: texto)
    }
}
