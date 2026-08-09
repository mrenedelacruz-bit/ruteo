import XCTest
@testable import PropiedadesNFC

final class ImportadorGeoJSONTests: XCTestCase {

    private let idFijo = UUID(uuidString: "6B29FC40-CA47-1067-B31D-00DD010662DA")!

    private func feature(
        id: String? = "6B29FC40-CA47-1067-B31D-00DD010662DA",
        lon: Double = -69.9312117,
        lat: Double = 18.4860976,
        codigo: String? = "P-001"
    ) -> String {
        let idParte = id.map { #""id":"\#($0)","# } ?? ""
        let codigoParte = codigo.map { #""codigo":"\#($0)""# } ?? ""
        return """
        {"type":"Feature",\(idParte)\
        "geometry":{"type":"Point","coordinates":[\(lon),\(lat)]},\
        "properties":{\(codigoParte)}}
        """
    }

    private func coleccion(_ features: [String]) -> Data {
        Data(#"{"type":"FeatureCollection","features":[\#(features.joined(separator: ","))]}"#.utf8)
    }

    // MARK: - Ciclo completo

    /// Lo que la app exporta debe poder reimportarse sin pérdida en otro
    /// dispositivo: es el mecanismo de traspaso entre equipos hasta que
    /// exista sincronización real.
    func test_exportarEImportarConservaLosCampos() throws {
        let original = Propiedad(
            id: idFijo,
            codigo: "P-001",
            nombre: "Solar Km 12",
            latitud: 18.4860976,
            longitud: -69.9312117,
            precisionHorizontal: 4.2,
            capturadoEn: Date(timeIntervalSince1970: 1_700_000_000),
            notas: "Nota de campo",
            estado: .activa
        )
        original.etiquetaEscritaEn = Date(timeIntervalSince1970: 1_700_000_100)

        let datos = ExportadorGeoJSON.featureCollection([original])
        let resultado = try ImportadorGeoJSON.importar(datos, existentes: [])

        XCTAssertEqual(resultado.nuevas.count, 1)
        XCTAssertTrue(resultado.errores.isEmpty)

        let importada = try XCTUnwrap(resultado.nuevas.first)
        XCTAssertEqual(importada.id, original.id)
        XCTAssertEqual(importada.codigo, original.codigo)
        XCTAssertEqual(importada.nombre, original.nombre)
        XCTAssertEqual(importada.latitud, original.latitud, accuracy: 1e-7)
        XCTAssertEqual(importada.longitud, original.longitud, accuracy: 1e-7)
        XCTAssertEqual(importada.precisionHorizontal, 4.2, accuracy: 0.05)
        XCTAssertEqual(importada.estado, .activa)
        XCTAssertEqual(importada.notas, original.notas)
        XCTAssertEqual(importada.capturadoEn, Date(timeIntervalSince1970: 1_700_000_000))
        XCTAssertEqual(importada.etiquetaEscritaEn, Date(timeIntervalSince1970: 1_700_000_100))
    }

    // MARK: - Dedupe

    func test_idExistenteEnBaseSeOmite() throws {
        let resultado = try ImportadorGeoJSON.importar(coleccion([feature()]), existentes: [idFijo])
        XCTAssertEqual(resultado.nuevas.count, 0)
        XCTAssertEqual(resultado.duplicadas, 1)
    }

    func test_idRepetidoDentroDelArchivoSeOmite() throws {
        let resultado = try ImportadorGeoJSON.importar(coleccion([feature(), feature()]), existentes: [])
        XCTAssertEqual(resultado.nuevas.count, 1)
        XCTAssertEqual(resultado.duplicadas, 1)
    }

    func test_sinIdSeGeneraUnoNuevo() throws {
        let resultado = try ImportadorGeoJSON.importar(coleccion([feature(id: nil)]), existentes: [])
        XCTAssertEqual(resultado.nuevas.count, 1)
        XCTAssertNotEqual(resultado.nuevas.first?.id, idFijo)
    }

    // MARK: - Validación

    func test_latitudFueraDeRangoSeRechazaConPistaDeInversion() throws {
        // Caso real: alguien exportó [lat, lon] en vez de [lon, lat] con
        // una latitud europea (48.85 lat, 2.35 lon invertidos no fallan;
        // 95 sí). El mensaje sugiere la causa probable.
        let resultado = try ImportadorGeoJSON.importar(coleccion([feature(lat: 95)]), existentes: [])
        XCTAssertEqual(resultado.nuevas.count, 0)
        XCTAssertEqual(resultado.errores.count, 1)
        XCTAssertTrue(resultado.errores[0].contains("invertidas"))
    }

    func test_longitudFueraDeRangoSeRechaza() throws {
        let resultado = try ImportadorGeoJSON.importar(coleccion([feature(lon: -190)]), existentes: [])
        XCTAssertEqual(resultado.errores.count, 1)
    }

    func test_sinCodigoSeRechaza() throws {
        let resultado = try ImportadorGeoJSON.importar(coleccion([feature(codigo: nil)]), existentes: [])
        XCTAssertEqual(resultado.nuevas.count, 0)
        XCTAssertEqual(resultado.errores.count, 1)
        XCTAssertTrue(resultado.errores[0].contains("codigo"))
    }

    func test_geometriaNoPuntualSeRechazaSinTumbarElResto() throws {
        let poligono = #"{"type":"Feature","geometry":{"type":"Polygon","coordinates":[]},"properties":{"codigo":"X"}}"#
        let resultado = try ImportadorGeoJSON.importar(coleccion([poligono, feature()]), existentes: [])
        // Un feature malo no aborta el archivo: entra lo válido, se reporta lo demás.
        XCTAssertEqual(resultado.nuevas.count, 1)
        XCTAssertEqual(resultado.errores.count, 1)
    }

    func test_precisionAusenteQuedaComoSentinela() throws {
        let resultado = try ImportadorGeoJSON.importar(coleccion([feature()]), existentes: [])
        let propiedad = try XCTUnwrap(resultado.nuevas.first)
        XCTAssertEqual(propiedad.precisionHorizontal, ImportadorGeoJSON.precisionDesconocida)
        XCTAssertFalse(propiedad.tienePrecisionConocida)
    }

    // MARK: - Archivo entero inválido

    func test_jsonInvalidoLanza() {
        XCTAssertThrowsError(try ImportadorGeoJSON.importar(Data("no json".utf8), existentes: []))
    }

    func test_featureSueltoSinColeccionLanza() {
        let suelto = Data(feature().utf8)
        XCTAssertThrowsError(try ImportadorGeoJSON.importar(suelto, existentes: [])) { error in
            XCTAssertTrue(error is ErrorImportacion)
        }
    }

    func test_coleccionVaciaEsValida() throws {
        let resultado = try ImportadorGeoJSON.importar(coleccion([]), existentes: [])
        XCTAssertTrue(resultado.nuevas.isEmpty)
        XCTAssertTrue(resultado.errores.isEmpty)
        XCTAssertEqual(resultado.duplicadas, 0)
    }
}
