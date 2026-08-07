# Guía: configurar las etiquetas NFC desde un iPhone

Cómo grabar una etiqueta NFC física para que, al acercarla al iPhone, abra la ficha del bien
mueble en el sistema.

---

## 0. Lo que hay que entender antes de empezar

Hay dos operaciones distintas y conviene no mezclarlas, porque tienen restricciones opuestas:

| Operación | ¿Hace falta una app? | ¿Con qué frecuencia? |
|---|---|---|
| **Grabar** la etiqueta (una vez, al dar de alta el bien) | Sí — **NFC Tools**, gratuita | Una sola vez por etiqueta |
| **Leer** la etiqueta (auditoría en campo) | **No** — lo hace iOS solo | Todos los días |

El motivo de la asimetría: **Safari no puede escribir en el chip NFC**. WebKit no expone la API
Web NFC a las páginas web y no hay ajuste, bandera ni permiso que lo habilite; es una decisión de
plataforma de Apple. En cambio, la **lectura en segundo plano** sí está integrada en iOS: al
detectar una etiqueta con una URL, el sistema muestra una notificación que abre esa URL.

Por eso el sistema se diseñó para grabar **solo una URL** en la etiqueta —nada de datos del
activo—: así el grabado se hace una vez con una app externa y toda la inteligencia queda del lado
del servidor, donde se puede corregir sin volver a tocar 500 etiquetas.

---

## 1. Material necesario

- **Etiquetas NFC NTAG213, NTAG215 o NTAG216** (13,56 MHz, ISO/IEC 14443A).
  Las tres sirven: la URL del sistema ocupa unos **64–70 bytes** y la NTAG213, la más pequeña,
  ofrece ~132 bytes útiles. La pestaña **Etiquetas** de la app muestra el cálculo exacto para
  cada bien.
- **iPhone XR o posterior** para la lectura automática en segundo plano.
  En iPhone 7 a X hay que usar el botón *Lector de NFC* del Centro de Control (Ajustes ›
  Centro de Control › añadir «Lector de NFC»).
- **App [NFC Tools](https://apps.apple.com/app/nfc-tools/id1252962749)** (wakdev), gratuita.
  Solo se usa para grabar.

> **Superficies metálicas.** Una etiqueta NFC común pegada sobre metal no se lee: el metal
> absorbe el campo. Para archivadores, maquinaria o vehículos hay que usar etiquetas
> «on-metal» / «anti-metal», que llevan una capa de ferrita.

---

## 2. Obtener la URL a grabar

1. En la PWA, entre a **Inventario** y registre el bien. Al guardar, el sistema le asigna su NCF
   (por ejemplo `NCF-202608-MOB-0042K`).
2. Vaya a la pestaña **Etiquetas**, seleccione el bien en el desplegable.
3. Pulse **📋 Copiar URL**. Queda en el portapapeles algo como:

   ```
   https://mrenedelacruz-bit.github.io/ruteo/activo/NCF-202608-MOB-0042K
   ```

La app también le indica ahí mismo cuántos bytes ocupa y en qué chips cabe.

> **¿Grabar antes de dar de alta el bien?** Es posible: la API expone
> `GET /api/v1/ncf/preview?categoria=Mobiliario`, que devuelve el próximo NCF libre sin crear
> nada. Sirve para preparar un lote de etiquetas en la oficina y luego asociarlas en campo.

---

## 3. Grabar la etiqueta con NFC Tools

1. Abra **NFC Tools** → pestaña **Escribir** (*Write*).
2. **Añadir un registro** (*Add a record*).
3. Elija **URL / URI**.

   ⚠️ **No** use «Texto» / *Text*. Un registro de texto plano **no** dispara la notificación de
   iOS: la etiqueta se leería, pero no abriría nada. Tiene que ser un registro **URI (0x55)**.

4. Pegue la URL copiada. Verifique que empieza por `https://` — NFC Tools comprime ese prefijo a
   **1 byte** con el código de abreviatura NDEF, y es lo que hace que quepa cómodamente en una
   NTAG213.
5. **Aceptar** → **Escribir** (*Write*).
6. Acerque la etiqueta al **borde superior** del iPhone, con la pantalla encendida y
   desbloqueada. Mantenga el contacto 1–2 segundos hasta el aviso de éxito.

### Comprobación (no se la salte)

Aparte el teléfono, bloquee la pantalla, vuelva a encenderla y acerque de nuevo la etiqueta.
Debe aparecer una notificación con el dominio del sistema; al tocarla, se abre la ficha del bien.

Si no aparece nada:

| Síntoma | Causa habitual | Solución |
|---|---|---|
| No pasa nada al acercar | La etiqueta no está en el borde superior | Deslice el teléfono lentamente por encima |
| No pasa nada, iPhone 7–X | No hay lectura en segundo plano en esos modelos | Use el *Lector de NFC* del Centro de Control |
| Se lee pero no abre nada | Se grabó como «Texto» y no como «URL» | Regrabe con el tipo URI |
| «Etiqueta protegida» al grabar | Ya estaba bloqueada | Use una etiqueta nueva; el bloqueo es irreversible |
| Se lee de forma intermitente | Superficie metálica o etiqueta doblada | Etiqueta «on-metal» o reubicarla |

---

## 4. Proteger la etiqueta contra reescritura

Una vez verificada, conviene impedir que alguien la reescriba con otra URL.

En NFC Tools: **Otros** (*Other*) → **Bloquear etiqueta** (*Lock tag*).

> **Esto es irreversible.** La etiqueta queda de solo lectura para siempre. Bloquee únicamente
> después de haber comprobado que la URL abre la ficha correcta. Si el activo cambia de código,
> habrá que sustituir la etiqueta física.

Alternativa intermedia: NFC Tools permite fijar una **contraseña** (protección por password de
NTAG21x) en lugar del bloqueo permanente. Es lo recomendable para un inventario grande, donde
tarde o temprano hay que corregir algo.

---

## 5. Etiquetado en lote

Para 50 o 500 activos, el orden que menos errores produce:

1. **En la oficina**: dé de alta todos los bienes en el panel **Inventario** (sin coordenadas).
2. Imprima una hoja con el NCF de cada uno; péguela junto a cada etiqueta en blanco.
3. Grabe las etiquetas una tras otra con NFC Tools. Copiar/pegar por bien es lento: si va a
   grabar más de ~30, use un teléfono Android con Chrome, entre a la pestaña **Etiquetas** y
   pulse **📡 Grabar etiqueta ahora** — ahí sí funciona la escritura directa desde el navegador.
4. **En campo**: pegue cada etiqueta en su activo, acerque el iPhone, y en la ficha pulse
   **Registrar auditoría de presencia** con *Sincronizar ubicación* marcado. Ese gesto captura
   la posición GPS real del bien, que es lo que puebla el mapa.

El paso 4 es también el procedimiento del inventario periódico: recorrer, acercar, confirmar.

---

## 6. Anatomía de la URL

```
https://mrenedelacruz-bit.github.io/ruteo/activo/NCF-202608-MOB-0042K
└──────────────── origen público ───────────┘└─ ruta ─┘└──── NCF ────┘
```

El NCF se descompone así:

```
NCF-202608-MOB-0042K
 │    │     │   │  └── carácter verificador (base36)
 │    │     │   └───── correlativo del mes dentro de la categoría
 │    │     └───────── código de categoría (MOB = Mobiliario)
 │    └─────────────── año y mes del alta
 └──────────────────── prefijo fijo
```

El **carácter verificador** es la razón por la que teclear mal un código da un mensaje inmediato
(«el verificador no corresponde») en vez de un «no encontrado» ambiguo. Está ponderado por
posición, así que detecta tanto un dígito cambiado como dos dígitos transpuestos.

**Cambiar de dominio invalida todas las etiquetas ya grabadas.** Si prevé migrar a un dominio
propio (`https://bienes.suempresa.com`), hágalo *antes* de etiquetar el parque, o configure una
redirección permanente 301 desde el dominio viejo.

---

## 7. Anexo: ¿por qué no Web NFC en iPhone?

| Plataforma | Leer desde la web | Grabar desde la web |
|---|---|---|
| Android + Chrome/Edge 89+ | ✅ Web NFC | ✅ Web NFC |
| iOS / iPadOS (Safari y cualquier otro navegador) | ❌ | ❌ |
| iOS — lectura de URL en segundo plano por el sistema | ✅ (iPhone XS+) | — |

Todos los navegadores de iOS usan WebKit por obligación, así que cambiar de navegador no cambia
nada. La app detecta la plataforma en `frontend/src/lib/nfc.ts` y muestra el flujo que
corresponde; no hay que configurar nada.
