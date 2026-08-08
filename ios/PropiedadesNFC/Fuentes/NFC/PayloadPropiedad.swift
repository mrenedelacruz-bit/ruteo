import Foundation
import CoreNFC

/// Contenido lógico que viaja dentro de una etiqueta NFC.
///
/// FORMATO CONGELADO. Cambiar el orden de los campos, el separador o el
/// polinomio del checksum invalida todas las etiquetas ya grabadas en campo.
/// Cualquier cambio de formato exige subir `version` y mantener el decoder
/// de las versiones anteriores.
struct PayloadPropiedad: Equatable, Sendable {

    /// Versión del formato. v1 = MIME JSON compacto + CRC-8.
    static let versionActual = 1

    /// Tipo MIME propietario del registro autoritativo.
    static let tipoMIME = "application/vnd.upgh.propiedad+json"

    /// Dominio del registro URI de respaldo (universal link).
    /// Debe coincidir con el `applinks:` del entitlement Associated Domains
    /// para que el tap en background abra la app.
    static let dominioRespaldo = "propiedades.upgh.app"

    let version: Int
    let id: UUID
    let codigo: String

    init(id: UUID, codigo: String, version: Int = PayloadPropiedad.versionActual) {
        self.version = version
        self.id = id
        self.codigo = codigo
    }
}

// MARK: - Codificación a NDEF

extension PayloadPropiedad {

    /// Cadena canónica sobre la que se calcula el checksum.
    /// El orden `version|id|codigo` es parte del formato: no reordenar.
    private var cadenaCanonica: String {
        "\(version)|\(id.uuidString)|\(codigo)"
    }

    var checksum: UInt8 { CRC8.calcular(Data(cadenaCanonica.utf8)) }

    /// JSON compacto con orden de claves fijo.
    ///
    /// Se construye a mano en vez de con `JSONEncoder` porque el orden de
    /// claves debe ser byte-estable: las etiquetas NFC baratas tienen 137–888
    /// bytes útiles y queremos un tamaño predecible y verificable en pruebas.
    var json: Data {
        let escapado = codigo.reemplazandoParaJSON()
        let texto = #"{"v":\#(version),"id":"\#(id.uuidString)","c":"\#(String(format: "%02X", checksum))","k":"\#(escapado)"}"#
        return Data(texto.utf8)
    }

    /// Mensaje NDEF completo listo para grabar.
    ///
    /// Orden de registros deliberado:
    ///   [0] URI  — iOS solo lanza la app desde un tap en background si el
    ///              primer registro es una URL asociada al dominio.
    ///   [1] MIME — registro autoritativo del que se lee el dato real.
    /// El decoder busca por tipo, no por posición, así que si un tercero
    /// reordena los registros la lectura sigue funcionando.
    func mensajeNDEF() throws -> NFCNDEFMessage {
        guard let url = URL(string: "https://\(Self.dominioRespaldo)/p/\(id.uuidString)"),
              let registroURI = NFCNDEFPayload.wellKnownTypeURIPayload(url: url) else {
            throw ErrorNFC.payloadInvalido("No se pudo construir el registro URI de respaldo")
        }

        let registroMIME = NFCNDEFPayload(
            format: .media,
            type: Data(Self.tipoMIME.utf8),
            identifier: Data(),
            payload: json
        )

        return NFCNDEFMessage(records: [registroURI, registroMIME])
    }

    /// Tamaño en bytes que ocupará el mensaje en la etiqueta.
    /// Usar antes de escribir para comparar contra la capacidad del tag.
    func tamanoEstimado() throws -> Int {
        try mensajeNDEF().length
    }
}

// MARK: - Decodificación desde NDEF

extension PayloadPropiedad {

    /// Extrae el payload de un mensaje leído de una etiqueta.
    ///
    /// Estrategia en cascada:
    ///   1. Registro MIME propietario (fuente autoritativa, con checksum).
    ///   2. Registro URI `/p/<uuid>` (respaldo si el MIME se perdió).
    /// Si ninguna funciona, lanza — nunca devuelve un dato a medias.
    static func decodificar(_ mensaje: NFCNDEFMessage) throws -> PayloadPropiedad {
        if let registro = mensaje.records.first(where: {
            $0.typeNameFormat == .media && String(data: $0.type, encoding: .utf8) == tipoMIME
        }) {
            return try decodificarJSON(registro.payload)
        }

        for registro in mensaje.records where registro.typeNameFormat == .nfcWellKnown {
            guard let url = registro.wellKnownTypeURIPayload() else { continue }
            let partes = url.pathComponents.filter { $0 != "/" }
            guard partes.count == 2, partes[0] == "p", let id = UUID(uuidString: partes[1]) else { continue }
            // El respaldo URI no transporta código ni checksum: se marca vacío
            // para que la capa superior sepa que debe resolver contra la base.
            return PayloadPropiedad(id: id, codigo: "")
        }

        throw ErrorNFC.etiquetaAjena
    }

    static func decodificarJSON(_ datos: Data) throws -> PayloadPropiedad {
        guard let objeto = try? JSONSerialization.jsonObject(with: datos) as? [String: Any] else {
            throw ErrorNFC.payloadInvalido("El registro no contiene JSON válido")
        }

        guard let version = objeto["v"] as? Int else {
            throw ErrorNFC.payloadInvalido("Falta el campo de versión 'v'")
        }
        guard version <= versionActual else {
            throw ErrorNFC.versionNoSoportada(version)
        }
        guard let idTexto = objeto["id"] as? String, let id = UUID(uuidString: idTexto) else {
            throw ErrorNFC.payloadInvalido("El campo 'id' no es un UUID válido")
        }

        let codigo = objeto["k"] as? String ?? ""
        let candidato = PayloadPropiedad(id: id, codigo: codigo, version: version)

        // El checksum protege contra escrituras truncadas: una etiqueta
        // retirada del campo NFC a media grabación puede quedar con JSON
        // sintácticamente válido pero con contenido parcial.
        guard let checksumTexto = objeto["c"] as? String,
              let checksumLeido = UInt8(checksumTexto, radix: 16) else {
            throw ErrorNFC.payloadInvalido("Falta el checksum 'c'")
        }
        guard checksumLeido == candidato.checksum else {
            throw ErrorNFC.checksumInvalido(esperado: candidato.checksum, leido: checksumLeido)
        }

        return candidato
    }
}

// MARK: - CRC-8

/// CRC-8/ATM (polinomio 0x07, init 0x00, sin reflexión, sin XOR final).
/// Implementación sin tabla: son 8 bytes de entrada típicos, no compensa.
enum CRC8 {
    static func calcular(_ datos: Data) -> UInt8 {
        var crc: UInt8 = 0x00
        for byte in datos {
            crc ^= byte
            for _ in 0..<8 {
                crc = (crc & 0x80) != 0 ? (crc << 1) ^ 0x07 : (crc << 1)
            }
        }
        return crc
    }
}

private extension String {
    /// Escape mínimo para incrustar en el JSON construido a mano.
    func reemplazandoParaJSON() -> String {
        var salida = ""
        for caracter in unicodeScalars {
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
        return salida
    }
}
