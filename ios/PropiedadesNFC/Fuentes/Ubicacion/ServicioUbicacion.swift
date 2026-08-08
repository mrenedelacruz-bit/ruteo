import Foundation
import CoreLocation

enum ErrorUbicacion: LocalizedError {
    case permisoDenegado
    case serviciosDesactivados
    case sinFixUtil(mejorPrecision: Double?)
    case fallo(String)

    var errorDescription: String? {
        switch self {
        case .permisoDenegado:
            return "La app no tiene permiso de ubicación. Actívalo en Ajustes › Privacidad › Localización."
        case .serviciosDesactivados:
            return "Los servicios de localización están desactivados en el dispositivo."
        case .sinFixUtil(let precision):
            if let precision {
                return String(format: "No se alcanzó una precisión utilizable. La mejor lectura fue de ±%.0f m.", precision)
            }
            return "No se obtuvo ninguna lectura GPS."
        case .fallo(let detalle):
            return "Error de localización: \(detalle)"
        }
    }
}

/// Captura de coordenadas en campo con control de calidad del fix.
///
/// El primer fix que entrega CoreLocation suele venir de red/Wi-Fi con
/// ±65 m o peor. Para georreferenciar propiedades eso es inservible, así
/// que el servicio no devuelve la primera lectura: acumula fixes hasta
/// alcanzar la precisión objetivo o agotar el tiempo, y entonces entrega
/// el mejor disponible siempre que supere el umbral aceptable.
@MainActor
final class ServicioUbicacion: NSObject, ObservableObject {

    /// Precisión ideal para dar por buena la captura de inmediato.
    static let precisionObjetivo: CLLocationAccuracy = 10
    /// Peor precisión que se acepta al agotar el tiempo. Por encima, se falla.
    static let precisionMaximaAceptable: CLLocationAccuracy = 35
    /// Antigüedad máxima de un fix para considerarlo del momento actual.
    static let antiguedadMaxima: TimeInterval = 5

    @Published private(set) var autorizacion: CLAuthorizationStatus
    @Published private(set) var capturando = false
    /// Mejor precisión observada durante la captura en curso (para la UI).
    @Published private(set) var precisionActual: CLLocationAccuracy?

    private let gestor = CLLocationManager()
    private var continuacion: CheckedContinuation<CLLocation, Error>?
    private var mejorFix: CLLocation?
    private var temporizador: Task<Void, Never>?

    override init() {
        autorizacion = gestor.authorizationStatus
        super.init()
        gestor.delegate = self
        gestor.desiredAccuracy = kCLLocationAccuracyBest
        gestor.activityType = .otherNavigation
    }

    func solicitarPermiso() {
        guard autorizacion == .notDetermined else { return }
        gestor.requestWhenInUseAuthorization()
    }

    /// Obtiene una coordenada de calidad controlada.
    /// - Parameter tiempoMaximo: segundos que se espera a mejorar el fix.
    func capturar(tiempoMaximo: TimeInterval = 15) async throws -> CLLocation {
        guard CLLocationManager.locationServicesEnabled() else {
            throw ErrorUbicacion.serviciosDesactivados
        }
        switch autorizacion {
        case .denied, .restricted:
            throw ErrorUbicacion.permisoDenegado
        case .notDetermined:
            gestor.requestWhenInUseAuthorization()
        default:
            break
        }
        guard continuacion == nil else {
            throw ErrorUbicacion.fallo("Ya hay una captura en curso.")
        }

        mejorFix = nil
        precisionActual = nil
        capturando = true
        gestor.startUpdatingLocation()

        // El temporizador vive fuera de la continuación porque debe poder
        // cerrarla incluso si CoreLocation deja de emitir actualizaciones.
        temporizador = Task { [weak self] in
            try? await Task.sleep(for: .seconds(tiempoMaximo))
            guard !Task.isCancelled else { return }
            await self?.agotarTiempo()
        }

        return try await withCheckedThrowingContinuation { cont in
            continuacion = cont
        }
    }

    func cancelar() {
        finalizar(.failure(CancellationError()))
    }

    // MARK: - Interno

    private func procesar(_ ubicaciones: [CLLocation]) {
        for ubicacion in ubicaciones {
            // Se descartan fixes cacheados: CoreLocation entrega el último
            // conocido al arrancar, que puede ser de otra ciudad.
            guard ubicacion.horizontalAccuracy > 0,
                  abs(ubicacion.timestamp.timeIntervalSinceNow) < Self.antiguedadMaxima else { continue }

            if let actual = mejorFix, actual.horizontalAccuracy <= ubicacion.horizontalAccuracy { continue }
            mejorFix = ubicacion
            precisionActual = ubicacion.horizontalAccuracy
        }

        if let mejor = mejorFix, mejor.horizontalAccuracy <= Self.precisionObjetivo {
            finalizar(.success(mejor))
        }
    }

    private func agotarTiempo() {
        guard let mejor = mejorFix else {
            finalizar(.failure(ErrorUbicacion.sinFixUtil(mejorPrecision: nil)))
            return
        }
        guard mejor.horizontalAccuracy <= Self.precisionMaximaAceptable else {
            finalizar(.failure(ErrorUbicacion.sinFixUtil(mejorPrecision: mejor.horizontalAccuracy)))
            return
        }
        finalizar(.success(mejor))
    }

    private func finalizar(_ resultado: Result<CLLocation, Error>) {
        guard let cont = continuacion else { return }
        continuacion = nil
        temporizador?.cancel()
        temporizador = nil
        gestor.stopUpdatingLocation()
        capturando = false
        cont.resume(with: resultado)
    }
}

// MARK: - CLLocationManagerDelegate
//
// El gestor se crea en el MainActor, así que CoreLocation entrega sus
// callbacks en el hilo principal. `assumeIsolated` documenta ese contrato
// sin pagar el salto de contexto de un `Task { @MainActor in }`, que
// además reordenaría las actualizaciones.
extension ServicioUbicacion: CLLocationManagerDelegate {

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        MainActor.assumeIsolated { procesar(locations) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        MainActor.assumeIsolated {
            // kCLErrorLocationUnknown es transitorio: CoreLocation sigue
            // intentando. Solo se aborta con errores definitivos.
            if let clError = error as? CLError, clError.code == .locationUnknown { return }
            finalizar(.failure(ErrorUbicacion.fallo(error.localizedDescription)))
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated {
            autorizacion = manager.authorizationStatus
            if autorizacion == .denied || autorizacion == .restricted {
                finalizar(.failure(ErrorUbicacion.permisoDenegado))
            }
        }
    }
}
