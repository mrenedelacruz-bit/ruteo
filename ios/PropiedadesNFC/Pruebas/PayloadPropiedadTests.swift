import XCTest
@testable import PropiedadesNFC

/// El formato del payload NFC es un contrato con hardware ya desplegado en
/// campo. Estas pruebas existen para que un cambio de formato rompa el build
/// y no las etiquetas ya grabadas.
final class PayloadPropiedadTests: XCTestCase {

    private let idFijo = UUID(uuidString: "6B29FC40-CA47-1067-B31D-00DD010662DA")!

    func test_jsonMantieneOrdenDeClavesYEstructura() throws {
        let payload = PayloadPropiedad(id: idFijo, codigo: "P-001")
        let texto = String(decoding: payload.json, as: UTF8.self)

        // Orden congelado: v, id, c, k.
        let indiceV = try XCTUnwrap(texto.range(of: #""v":"#)).lowerBound
        let indiceID = try XCTUnwrap(texto.range(of: #""id":"#)).lowerBound
        let indiceC = try XCTUnwrap(texto.range(of: #""c":"#)).lowerBound
        let indiceK = try XCTUnwrap(texto.range(of: #""k":"#)).lowerBound
        XCTAssertTrue(indiceV < indiceID && indiceID < indiceC && indiceC < indiceK)

        XCTAssertTrue(texto.contains(#""id":"6B29FC40-CA47-1067-B31D-00DD010662DA""#))
        XCTAssertTrue(texto.hasPrefix("{") && texto.hasSuffix("}"))
    }

    /// Fija el ejemplo documentado en el README. Si cambia el separador, el
    /// orden de la cadena canónica o el polinomio, esta prueba lo delata.
    func test_checksumDelEjemploDocumentado() {
        let payload = PayloadPropiedad(id: idFijo, codigo: "P-001")
        XCTAssertEqual(payload.checksum, 0x44)
        XCTAssertEqual(
            String(decoding: payload.json, as: UTF8.self),
            #"{"v":1,"id":"6B29FC40-CA47-1067-B31D-00DD010662DA","c":"44","k":"P-001"}"#
        )
    }

    func test_idaYVueltaConservaElContenido() throws {
        let original = PayloadPropiedad(id: idFijo, codigo: "SD-4471")
        let recuperado = try PayloadPropiedad.decodificarJSON(original.json)
        XCTAssertEqual(original, recuperado)
    }

    func test_codigoConComillasYSaltosSeEscapaCorrectamente() throws {
        let original = PayloadPropiedad(id: idFijo, codigo: #"Lote "A"\B"# + "\n2")
        let recuperado = try PayloadPropiedad.decodificarJSON(original.json)
        XCTAssertEqual(original.codigo, recuperado.codigo)
    }

    func test_checksumDetectaAlteracionDelCodigo() throws {
        let original = PayloadPropiedad(id: idFijo, codigo: "P-001")
        // Se simula una etiqueta manipulada: mismo JSON válido, código distinto,
        // checksum sin recalcular. Es exactamente lo que produce una escritura
        // truncada o una etiqueta clonada a medias.
        let alterado = String(decoding: original.json, as: UTF8.self)
            .replacingOccurrences(of: #""k":"P-001""#, with: #""k":"P-002""#)

        XCTAssertThrowsError(try PayloadPropiedad.decodificarJSON(Data(alterado.utf8))) { error in
            guard case ErrorNFC.checksumInvalido = error as? ErrorNFC else {
                return XCTFail("Se esperaba checksumInvalido, se obtuvo \(error)")
            }
        }
    }

    func test_versionFuturaSeRechaza() {
        let json = Data(#"{"v":99,"id":"6B29FC40-CA47-1067-B31D-00DD010662DA","c":"00","k":"X"}"#.utf8)
        XCTAssertThrowsError(try PayloadPropiedad.decodificarJSON(json)) { error in
            XCTAssertEqual(error as? ErrorNFC, .versionNoSoportada(99))
        }
    }

    func test_uuidInvalidoSeRechaza() {
        let json = Data(#"{"v":1,"id":"no-es-un-uuid","c":"00","k":"X"}"#.utf8)
        XCTAssertThrowsError(try PayloadPropiedad.decodificarJSON(json))
    }

    func test_mensajeNDEFCabeEnUnaNTAG213() throws {
        // NTAG213 = 144 bytes de usuario, ~137 útiles para NDEF.
        // Si esta prueba falla, el formato dejó de caber en la etiqueta más
        // barata del mercado y hay que subir de chip o acortar el payload.
        let payload = PayloadPropiedad(id: idFijo, codigo: "P-00001")
        XCTAssertLessThanOrEqual(try payload.tamanoEstimado(), 137)
    }

    func test_ndefIdaYVuelta() throws {
        let original = PayloadPropiedad(id: idFijo, codigo: "P-001")
        let recuperado = try PayloadPropiedad.decodificar(original.mensajeNDEF())
        XCTAssertEqual(original, recuperado)
    }

    func test_crc8EsEstable() {
        // Vector de control del CRC-8/ATM (poly 0x07, init 0x00).
        XCTAssertEqual(CRC8.calcular(Data("123456789".utf8)), 0xF4)
        XCTAssertEqual(CRC8.calcular(Data()), 0x00)
    }
}
