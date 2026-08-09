import Foundation

extension Data {
    /// Serial físico del chip en hexadecimal, mayúsculas, sin separadores
    /// (p. ej. "04A1B2C3D4E5F6"). FORMATO CONGELADO: es el valor que se
    /// persiste en `Propiedad.etiquetaSerial` y contra el que se compara
    /// en la verificación anti-clonación — cambiar el formato invalida
    /// todas las comparaciones con seriales ya guardados.
    var serialHex: String {
        map { String(format: "%02X", $0) }.joined()
    }
}
