import XCTest
@testable import PropiedadesNFC

/// El formato hexadecimal del serial es un contrato: se persiste en
/// `Propiedad.etiquetaSerial` y se compara byte a byte en la verificación
/// anti-clonación. Cambiarlo invalida todas las comparaciones con
/// seriales ya guardados.
final class SerialEtiquetaTests: XCTestCase {

    func test_formatoHexMayusculasSinSeparadores() {
        // UID típico de 7 bytes de una NTAG213 (empieza por 0x04 = NXP).
        let uid = Data([0x04, 0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6])
        XCTAssertEqual(uid.serialHex, "04A1B2C3D4E5F6")
    }

    func test_bytesBajosConservanElCeroIzquierdo() {
        // Sin el %02X, 0x04 saldría como "4" y "04-0A" y "40-A0" colisionarían.
        XCTAssertEqual(Data([0x04, 0x0A]).serialHex, "040A")
        XCTAssertEqual(Data([0x00, 0xFF]).serialHex, "00FF")
    }

    func test_dataVaciaProduceCadenaVacia() {
        XCTAssertEqual(Data().serialHex, "")
    }
}
