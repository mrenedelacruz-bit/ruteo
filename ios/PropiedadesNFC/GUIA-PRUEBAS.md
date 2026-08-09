# Guía de pruebas en dispositivo — PropiedadesNFC

Plan para validar la app en campo antes de decidir sobre la sincronización multiusuario.

## 1. Hardware necesario

| Qué | Detalle |
|---|---|
| iPhone | iPhone 7 o superior con iOS 17+. Para probar el tap en background (app cerrada), iPhone XS o superior. |
| Etiquetas NFC | **NTAG213** adhesivas (137 B útiles — el payload actual ocupa menos, hay prueba que lo garantiza). Compra 10+: las pruebas de bloqueo permanente consumen etiquetas, no se pueden reutilizar. |
| Opcional | 2-3 NTAG215/216 para verificar que el código no depende del tamaño del chip. |
| Opcional | Una app de terceros tipo "NFC Tools" para la prueba de clonación (§4.6). |

## 2. Puesta en marcha en el Mac

```bash
git clone -b claude/expert-programming-skill-hy91ik https://github.com/mrenedelacruz-bit/ruteo.git
cd ruteo/ios/PropiedadesNFC
brew install xcodegen
xcodegen generate
open PropiedadesNFC.xcodeproj
```

Antes de compilar:

1. **`project.yml` → `DEVELOPMENT_TEAM`**: pon tu Team ID (Xcode → Settings → Accounts) y regenera con `xcodegen generate`, o selecciónalo en Signing & Capabilities.
2. **Portal de desarrolladores** (cuenta de pago): App ID con capability **Near Field Communication Tag Reading**. Con cuenta de pago el perfil se regenera solo desde Xcode.
3. **Si usas Apple ID gratuito (personal team)**: el perfil expira cada 7 días y **Associated Domains no está disponible** — elimina la clave `com.apple.developer.associated-domains` de `PropiedadesNFC.entitlements` o la firma fallará. La lectura NFC explícita funciona igual; solo pierdes el tap en background.
4. Ejecuta primero las pruebas (no necesitan iPhone): `Cmd+U` en el esquema `PropiedadesNFC`. Si algo no compila tras la primera apertura, es ajuste de firma o de SDK, no de lógica — repórtalo tal cual.

> El simulador sirve para todo lo que no es NFC: captura GPS (Features → Location → Custom Location), mapa, inventario, import/export. NFC exige iPhone físico.

## 3. Orden recomendado de la sesión de campo

Primero sin salir de casa (§4.1–4.3), después en exterior (§4.4), y las destructivas al final (§4.7): una etiqueta bloqueada no se recupera.

## 4. Plan de pruebas

### 4.1 Captura y mapa (simulador o dispositivo)

- [ ] Alta de propiedad: sin fix GPS el botón Guardar debe estar deshabilitado.
- [ ] En interior profundo: la captura debe **fallar con mensaje de precisión**, no guardar un punto malo (umbral: ±35 m).
- [ ] La fila del inventario muestra la precisión; >15 m sale en naranja.
- [ ] El mapa encuadra todas las propiedades; con una sola, no hace zoom absurdo.

### 4.2 Export / import (simulador o dispositivo)

- [ ] Exportar GeoJSON y abrirlo en [geojson.io](https://geojson.io): los puntos deben caer **en República Dominicana, no en el océano** (si caen frente a África occidental, lon/lat están invertidas — repórtalo de inmediato).
- [ ] Pasar el archivo a otro dispositivo/simulador e importarlo: mismo conteo, campos intactos.
- [ ] Reimportar el mismo archivo: todo debe salir como "duplicada(s) omitida(s)", cero cambios.

### 4.3 NFC básico (iPhone físico)

- [ ] Grabar etiqueta desde el detalle: la ficha pasa a Activa y muestra el serial del chip.
- [ ] Escanear desde el toolbar: abre la ficha correcta.
- [ ] Acercar una etiqueta en blanco al escanear: mensaje "en blanco", sin crash.
- [ ] Acercar una etiqueta ajena (grabada con otra app): "no pertenece a esta aplicación".
- [ ] Dos etiquetas juntas: pide separarlas y sigue funcionando sin reabrir la hoja.
- [ ] Cancelar la hoja del sistema: ninguna alerta de error (cancelar no es un error).

### 4.4 GPS en exterior real

- [ ] Captura a cielo abierto: debería cerrar en segundos con ±4–10 m.
- [ ] Junto a un edificio alto: observa el indicador de "mejor lectura" mejorando; si cierra por tiempo, la precisión guardada debe ser ≤ ±35 m.
- [ ] Reubicar una propiedad: la nota de auditoría con las coordenadas anteriores debe aparecer en la ficha.

### 4.5 Background tap (iPhone XS+, solo con cuenta de pago y dominio publicado)

- [ ] Con la app cerrada, acercar una etiqueta grabada: iOS debe mostrar la notificación del universal link. Si no publicaste el dominio `propiedades.upgh.app`, salta esta sección — está previsto que no funcione.

### 4.6 Anti-clonación (iPhone físico + NFC Tools)

- [ ] Con NFC Tools, copia el contenido NDEF de una etiqueta grabada a una etiqueta virgen (un "clon").
- [ ] Escanear el clon: la app debe **rechazarlo** con el aviso de serial no coincidente. Este es el caso de prueba más importante de la migración a `NFCTagReaderSession`.
- [ ] Escanear la etiqueta original: debe seguir abriendo la ficha con normalidad.

### 4.7 Bloqueo permanente (destructivo — al final, con etiquetas de sacrificio)

- [ ] Intentar bloquear acercando la etiqueta de **otra** propiedad: debe abortar sin tocar nada.
- [ ] Bloquear la etiqueta correcta: doble confirmación → éxito → el botón Regrabar desaparece.
- [ ] Reintentar el bloqueo sobre la misma etiqueta: "ya estaba bloqueada", sin error.
- [ ] Intentar regrabar la etiqueta bloqueada con NFC Tools: debe fallar (eso es el write-lock físico funcionando).

## 5. Qué anotar cuando algo falle

1. Sección y paso de esta guía.
2. Mensaje exacto en pantalla (captura).
3. Modelo de iPhone, versión de iOS y tipo de etiqueta.
4. Si es reproducible siempre o intermitente.

Con eso se corrige a la primera; "no funcionó el NFC" obliga a adivinar.
