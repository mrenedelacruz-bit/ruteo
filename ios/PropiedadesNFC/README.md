# PropiedadesNFC

App iOS de inventario de propiedades georreferenciadas con rotulado físico por etiquetas NFC.

**Stack:** SwiftUI · SwiftData (local) · MapKit nativo · Core NFC (NDEF lectura/escritura) · CoreLocation
**Mínimo:** iOS 17.0 · iPhone 7 o superior

---

## Arquitectura

```
Fuentes/
├── App/            PropiedadesNFCApp.swift      Punto de entrada, ModelContainer, servicios inyectados
├── Modelos/        Propiedad.swift              @Model + EstadoPropiedad
├── NFC/            PayloadPropiedad.swift       Formato del dato grabado en la etiqueta (congelado)
│                   ServicioNFC.swift            Fachada async/await sobre Core NFC
│                   ErrorNFC.swift               Dominio de errores + traducción de NFCReaderError
├── Ubicacion/      ServicioUbicacion.swift      Captura GPS con control de calidad del fix
├── Exportacion/    ExportadorGeoJSON.swift      Salida RFC 7946 determinista
├── Vistas/         RootView / Mapa / Captura / Detalle
└── Recursos/       Info.plist · entitlements
Pruebas/            Contratos de formato NFC y GeoJSON
```

La separación clave es **servicio ↔ vista**: `ServicioNFC` y `ServicioUbicacion` no conocen SwiftUI ni SwiftData, y las vistas nunca tocan `NFCNDEFReaderSession` ni `CLLocationManager` directamente. Eso permite probar el formato de datos sin dispositivo.

---

## Puesta en marcha

```bash
brew install xcodegen
cd ios/PropiedadesNFC
xcodegen generate
open PropiedadesNFC.xcodeproj
```

Se versiona `project.yml` en vez del `.xcodeproj` porque el `pbxproj` produce conflictos de merge irresolubles en cuanto hay dos personas trabajando.

### Antes de compilar en dispositivo

1. Rellenar `DEVELOPMENT_TEAM` en `project.yml` con tu Team ID.
2. En el portal de desarrolladores, activar en el App ID la capability **Near Field Communication Tag Reading**. Sin esto el perfil no incluye el entitlement y `NFCNDEFReaderSession.begin()` falla al arrancar.
3. Si **no** vas a publicar el dominio de universal links, elimina la clave `com.apple.developer.associated-domains` del `.entitlements` y ajusta `PayloadPropiedad.dominioRespaldo`.

---

## Restricciones de plataforma que condicionan el diseño

Estas no son opinables, son límites de Apple. Vienen documentadas aquí porque cada una ya está reflejada en el código:

| Límite | Consecuencia en el código |
|---|---|
| **Core NFC no funciona en el simulador** | `ServicioNFC.disponible` oculta toda la UI de NFC en lugar de mostrar botones muertos. Las pruebas cubren el *formato*, no la sesión. |
| **`NFCNDEFReaderSession` no expone el UID de la etiqueta** | La identidad vive dentro del payload NDEF (`PayloadPropiedad`), no en el serial. El campo `Propiedad.etiquetaSerial` queda reservado y `nil` hasta que se migre a `NFCTagReaderSession`. |
| **Solo una sesión NFC por proceso** | `ServicioNFC.operacionEnCurso` bloquea una segunda llamada concurrente; un `begin()` solapado invalida la anterior en silencio. |
| **`invalidateAfterFirstRead: true` no entrega `didDetect tags:`** | Se usa siempre `false`, incluso para lectura, porque hay que consultar `queryNDEFStatus` antes de leer o escribir. |
| **La escritura no verifica capacidad por sí sola** | Se compara `mensaje.length` contra la capacidad reportada antes de grabar. Sin eso queda un NDEF truncado que pasa como válido. |
| **Lectura en background solo con iPhone XS+** | El primer registro del mensaje es el URI, no el MIME, para que el tap sin app abierta pueda abrirla. El decoder busca por tipo, no por posición. |
| **El primer fix de CoreLocation viene con ±65 m** | `ServicioUbicacion` acumula lecturas hasta ±10 m o 15 s, y rechaza el guardado por encima de ±35 m. |
| **`#Predicate` no admite propiedades computadas** | `EstadoPropiedad` se persiste como `String` crudo (`estadoRaw`) y el enum vive en una extensión. |

---

## Formato de la etiqueta NFC (v1) — CONGELADO

Mensaje NDEF de dos registros:

| # | Tipo | Contenido |
|---|---|---|
| 0 | URI (Well Known) | `https://propiedades.upgh.app/p/<UUID>` — respaldo para tap en background |
| 1 | MIME `application/vnd.upgh.propiedad+json` | Registro autoritativo |

Payload del registro MIME, con **orden de claves fijo**:

```json
{"v":1,"id":"6B29FC40-CA47-1067-B31D-00DD010662DA","c":"44","k":"P-001"}
```

- `v` — versión del formato
- `id` — UUID de la propiedad; **nunca cambia una vez grabado**, reescribirlo deja huérfanas las etiquetas ya desplegadas
- `c` — CRC-8/ATM en hexadecimal sobre `"v|id|k"`, detecta grabaciones truncadas
- `k` — código legible

Cabe en una NTAG213 (137 B útiles); hay una prueba que falla si deja de caber.

**Para cambiar el formato:** subir `versionActual`, mantener el decoder de v1, y no tocar `cadenaCanonica` de las versiones anteriores.

---

## Formato de exportación GeoJSON

`ExportadorGeoJSON` produce RFC 7946 con serialización manual, no `JSONEncoder`. Las tres reglas que lo justifican:

1. **`coordinates` es `[longitud, latitud]`.** Es el error número uno en integraciones de geodata: el resto del mundo dice "lat, lon" y el estándar dice lo contrario. Invertirlo manda todas las propiedades de RD al golfo de Guinea sin que nada falle visiblemente. Hay una prueba dedicada solo a esto.
2. **Orden de claves congelado.** `JSONEncoder` no garantiza el orden; hay consumidores de BI mapeando por posición.
3. **Redondeo explícito a 7 decimales** (~1,1 cm). Sin él, el ruido de coma flotante genera diffs espurios en cada exportación.

`ExportadorGeoJSONTests.test_salidaEsByteExacta` es intencionalmente frágil: cualquier cambio en el formato debe romper el build antes que a un consumidor aguas abajo.

---

## Pruebas

```bash
xcodebuild test -scheme PropiedadesNFC -destination 'platform=iOS Simulator,name=iPhone 15'
```

Cubren los dos contratos de formato (NFC y GeoJSON), que son lo único que no se puede corregir con un parche una vez desplegado en campo. La sesión NFC en sí requiere dispositivo físico y se valida a mano.

---

## Pendiente / siguientes pasos

- [ ] Sincronización multiusuario (hoy el store es local por dispositivo; ver opción PostGIS descartada en el diseño inicial).
- [ ] Migración a `NFCTagReaderSession` si se necesita el UID físico o autenticación por sector.
- [ ] Bloqueo permanente de etiquetas (`writeLock`) tras validación en campo — irreversible, requiere confirmación explícita en UI.
- [ ] Importación GeoJSON para cargar un dataset base.
