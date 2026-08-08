import XCTest
@testable import PropiedadesNFC

final class ExportadorGeoJSONTests: XCTestCase {

    private func propiedadDeControl() -> Propiedad {
        Propiedad(
            id: UUID(uuidString: "6B29FC40-CA47-1067-B31D-00DD010662DA")!,
            codigo: "P-001",
            nombre: "Solar Km 12",
            latitud: 18.4860976,
            longitud: -69.9312117,
            precisionHorizontal: 4.2,
            altitud: nil,
            capturadoEn: Date(timeIntervalSince1970: 1_700_000_000),
            notas: "",
            estado: .borrador
        )
    }

    /// Prueba de bytes exactos. Es intencionalmente frágil: cualquier cambio
    /// de orden, formato de fecha o redondeo debe romperla, porque hay
    /// consumidores de BI mapeando estas columnas.
    func test_salidaEsByteExacta() {
        let datos = ExportadorGeoJSON.featureCollection([propiedadDeControl()])
        let esperado = """
        {"type":"FeatureCollection","features":[{"type":"Feature",\
        "id":"6B29FC40-CA47-1067-B31D-00DD010662DA",\
        "geometry":{"type":"Point","coordinates":[-69.9312117,18.4860976]},\
        "properties":{"codigo":"P-001","nombre":"Solar Km 12","estado":"borrador",\
        "precision_m":4.2,"capturado_en":"2023-11-14T22:13:20Z",\
        "actualizado_en":"2023-11-14T22:13:20Z","etiqueta_escrita_en":null,\
        "etiqueta_serial":null,"notas":""}}]}
        """
        XCTAssertEqual(String(decoding: datos, as: UTF8.self), esperado)
    }

    /// La comprobación que más veces salva un proyecto de geodata:
    /// GeoJSON es [longitud, latitud], nunca al revés.
    func test_ordenDeCoordenadasEsLongitudLatitud() throws {
        let propiedad = propiedadDeControl()
        let texto = String(decoding: ExportadorGeoJSON.featureCollection([propiedad]), as: UTF8.self)

        let rango = try XCTUnwrap(texto.range(of: #""coordinates":\[[^\]]+\]"#, options: .regularExpression))
        let par = texto[rango]
            .replacingOccurrences(of: #""coordinates":["#, with: "")
            .replacingOccurrences(of: "]", with: "")
            .split(separator: ",")
            .compactMap { Double($0) }

        XCTAssertEqual(par.count, 2)
        XCTAssertEqual(par[0], propiedad.longitud, accuracy: 1e-7, "El primer valor debe ser la LONGITUD")
        XCTAssertEqual(par[1], propiedad.latitud, accuracy: 1e-7, "El segundo valor debe ser la LATITUD")
    }

    func test_altitudSeEmiteComoTercerComponenteSoloSiExiste() {
        let propiedad = propiedadDeControl()
        propiedad.altitud = 132.456
        let texto = String(decoding: ExportadorGeoJSON.featureCollection([propiedad]), as: UTF8.self)
        XCTAssertTrue(texto.contains(#""coordinates":[-69.9312117,18.4860976,132.46]"#))
    }

    func test_coleccionVaciaSigueSiendoGeoJSONValido() throws {
        let datos = ExportadorGeoJSON.featureCollection([])
        XCTAssertEqual(String(decoding: datos, as: UTF8.self), #"{"type":"FeatureCollection","features":[]}"#)
        XCTAssertNoThrow(try JSONSerialization.jsonObject(with: datos))
    }

    func test_camposDeTextoSeEscapan() throws {
        let propiedad = propiedadDeControl()
        propiedad.notas = "Línea 1\nCon \"comillas\" y \\barra"
        let datos = ExportadorGeoJSON.featureCollection([propiedad])

        // Si el escape estuviera mal, esto lanzaría.
        let objeto = try JSONSerialization.jsonObject(with: datos) as? [String: Any]
        let features = try XCTUnwrap(objeto?["features"] as? [[String: Any]])
        let props = try XCTUnwrap(features.first?["properties"] as? [String: Any])
        XCTAssertEqual(props["notas"] as? String, propiedad.notas)
    }

    func test_numeroNoUsaNotacionCientificaNiCeroNegativo() {
        XCTAssertEqual(ExportadorGeoJSON.numero(0.0000001, decimales: 7), "0.0000001")
        XCTAssertEqual(ExportadorGeoJSON.numero(-0.00000001, decimales: 7), "0.0")
        XCTAssertEqual(ExportadorGeoJSON.numero(15.0, decimales: 7), "15.0")
        XCTAssertEqual(ExportadorGeoJSON.numero(.nan, decimales: 7), "null")
    }
}
