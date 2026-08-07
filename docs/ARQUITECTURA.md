# Arquitectura

## Elección tecnológica

| Capa | Elección | Por qué |
|---|---|---|
| Frontend | **Vite + React 19 + TypeScript** | Bundle pequeño (~133 kB gzip) y arranque rápido, que es lo que importa cuando la app se abre desde una notificación NFC con datos móviles. |
| Mapa | **Leaflet + OpenStreetMap** | Sin clave de API, sin cuota, sin coste. Para unos cientos de pines internos, Mapbox/Google no aportan nada que justifique la facturación y el registro. |
| Backend | **FastAPI + SQLModel** | El menor código posible para un CRUD tipado: validación, serialización y documentación OpenAPI salen del mismo modelo. Un equivalente en Node/Express exigiría Zod + Swagger a mano. |
| Base de datos | **SQLite → PostgreSQL** | SQLite para el prototipo (cero instalación). Cambiar `DATABASE_URL` basta para pasar a Postgres: SQLModel/SQLAlchemy abstraen el dialecto. |
| Estado del cliente | `useState` + hooks propios | Cuatro pantallas y poco volumen de datos. React Query sería una dependencia más que mantener sin beneficio medible. |
| PWA | Manifest + service worker escrito a mano | La política de caché es corta y muy específica; Workbox añadiría configuración opaca para 100 líneas de lógica. |

> **¿Por qué no Next.js?** El renderizado en servidor no aporta aquí: la app es una herramienta
> interna tras una notificación NFC, no una página que deba posicionar en buscadores. Un SPA
> estático se publica en GitHub Pages sin servidor Node, y el backend queda desacoplado y
> reutilizable desde cualquier otro cliente.

---

## Estructura de carpetas

```
ruteo/
├── backend/                       API REST (FastAPI)
│   ├── app/
│   │   ├── main.py                Punto de entrada: CORS, routers, ciclo de vida
│   │   ├── seed.py                Datos de ejemplo
│   │   ├── core/config.py         Configuración por variables de entorno
│   │   ├── db/session.py          Motor y dependencia de sesión
│   │   ├── models/                Tablas SQLModel
│   │   │   ├── bien.py            bienes_muebles — estado actual
│   │   │   ├── auditoria.py       auditorias — bitácora inmutable
│   │   │   └── enums.py           Estado, Categoría, TipoEvento
│   │   ├── schemas/bien.py        Esquemas de entrada/salida (Pydantic)
│   │   ├── services/
│   │   │   ├── ncf.py             Generación/validación del NCF (con verificador)
│   │   │   └── inventario.py      Reglas de negocio
│   │   └── api/
│   │       ├── deps.py            Dependencias (validar NCF, cargar bien)
│   │       └── routes/bienes.py   Endpoints
│   ├── tests/test_api.py          12 pruebas
│   └── requirements.txt
│
├── frontend/                      PWA
│   ├── public/
│   │   ├── manifest.webmanifest
│   │   ├── sw.js                  Service worker
│   │   └── icons/                 Íconos generados por script
│   ├── scripts/
│   │   ├── generar-iconos.mjs     PNG sin dependencias externas
│   │   └── postbuild.mjs          404.html + rebase del manifest
│   └── src/
│       ├── App.tsx                Enrutado
│       ├── config.ts              API base, modo local, usuario
│       ├── types.ts               Espejo de los esquemas del backend
│       ├── lib/
│       │   ├── ncf.ts             Validación en cliente (misma lógica que el backend)
│       │   ├── geo.ts             Geolocalización con errores accionables
│       │   ├── nfc.ts             Web NFC + detección de plataforma
│       │   ├── estilos.ts         Colores por estado, formateo de fechas
│       │   └── repo/              ← capa de datos intercambiable
│       │       ├── tipos.ts       Interfaz `Repositorio`
│       │       ├── restRepo.ts    Contra FastAPI (+ outbox offline)
│       │       ├── localRepo.ts   Contra localStorage
│       │       └── index.ts       Selector
│       ├── hooks/useBienes.ts
│       ├── components/            Mapa, tarjeta, badge, botón GPS, navegación
│       └── pages/
│           ├── MapaPage.tsx       Mapa interactivo
│           ├── ActivoPage.tsx     /activo/:ncf ← lo que abre el escaneo NFC
│           ├── EscanearPage.tsx   Entrada manual y Web NFC
│           ├── AdminPage.tsx      Alta y listado
│           └── EtiquetasPage.tsx  Preparación de etiquetas
│
├── docs/
│   ├── ARQUITECTURA.md            (este archivo)
│   └── GUIA-NFC-IPHONE.md         Guía de grabado con NFC Tools
└── .github/workflows/pages.yml    Despliegue de la PWA
```

---

## Las tres decisiones que sostienen el diseño

### 1. La etiqueta guarda una URL, no datos

En la etiqueta va solo `https://…/activo/{NCF}`. Ni el nombre, ni el estado, ni las coordenadas.

Esto tiene consecuencias prácticas:

- Corregir la descripción de un activo no obliga a reescribir su etiqueta.
- Una NTAG213 de 144 bytes basta para cualquier activo.
- La etiqueta funciona sin app instalada: iOS abre URLs por sí solo.
- El control de acceso vive en el servidor, no en un chip que cualquiera puede leer.

### 2. La capa `repo/` desacopla la UI del origen de los datos

Los componentes importan `repo` y no saben si detrás hay una API REST o `localStorage`. Con
`VITE_API_BASE` definida se usa `RestRepo`; sin ella, `LocalRepo`.

Esto permite publicar una demo completamente funcional en GitHub Pages —que solo sirve archivos
estáticos— y probar el flujo NFC real en un iPhone antes de levantar infraestructura. Pasar a
producción es definir una variable de entorno.

### 3. La bitácora es inmutable

`bienes_muebles` guarda el estado actual; `auditorias` solo recibe filas nuevas, nunca
actualizaciones ni borrados. Un inventario de bienes vale por su trazabilidad: la pregunta
«¿quién movió esto y cuándo?» se responde desde la bitácora, no desde el estado.

Por eso una auditoría de presencia **no** mueve el pin del mapa salvo que el usuario lo pida
explícitamente: un escaneo confirma que el bien *existe*, no que se haya mudado.

---

## API REST

Base: `/api/v1`. Documentación interactiva en `/docs` (generada por FastAPI).

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/bienes` | Listado filtrable (`estado`, `categoria`, `usuario`, `solo_geolocalizados`) |
| `POST` | `/bienes` | Alta + generación del NCF |
| `GET` | `/bienes/{ncf}` | Ficha técnica — **la consulta el escaneo NFC** |
| `PATCH` | `/bienes/{ncf}` | Edición parcial |
| `DELETE` | `/bienes/{ncf}` | Eliminar del registro |
| `PUT` | `/bienes/{ncf}/ubicacion` | Fijar coordenadas desde el GPS del teléfono |
| `POST` | `/bienes/{ncf}/auditorias` | Registrar auditoría de presencia |
| `GET` | `/bienes/{ncf}/auditorias` | Historial |
| `GET` | `/ncf/preview?categoria=` | Próximo NCF libre, sin crear nada |
| `GET` | `/catalogos` | Estados y categorías para los selectores |

**Códigos de error, y por qué importan en campo:**

- `422` — el NCF está mal formado o su verificador no cuadra → *lo tecleó mal*.
- `404` — el NCF es válido pero no hay bien asociado → *esa etiqueta no está dada de alta*.

Distinguirlos evita que un inspector concluya «el sistema no sirve» cuando en realidad se comió
un dígito.

---

## Flujo de una lectura en campo

```
 Etiqueta NFC                iPhone                    PWA                    API
      │                        │                        │                      │
      │◄─── acercamiento ──────┤                        │                      │
      │──── URI NDEF ─────────►│                        │                      │
      │                        │ notificación del       │                      │
      │                        │ sistema (sin app)      │                      │
      │                        │──── toque ────────────►│                      │
      │                        │                        │ GET /bienes/{ncf} ──►│
      │                        │                        │◄──── ficha ──────────│
      │                        │                    [ ficha en pantalla ]      │
      │                        │                        │                      │
      │                        │  «Registrar auditoría de presencia»           │
      │                        │◄── permiso GPS ────────│                      │
      │                        │──── coordenadas ──────►│                      │
      │                        │                        │ POST …/auditorias ──►│
      │                        │                        │◄─ evento + bien ─────│
```

Si el GPS falla (frecuente bajo techo), la auditoría se registra igual sin coordenadas: se pierde
la posición, no el chequeo.

Si falla la **red**, `RestRepo` encola la auditoría en `localStorage` y la reintenta al recuperar
la conexión. WebKit no implementa Background Sync, así que el reintento se dispara desde la
propia página con el evento `online`.

---

## Seguridad — lo que falta antes de producción

El prototipo **no tiene autenticación**: cualquiera con la URL puede leer y escribir. Antes de
un despliegue real hace falta:

1. **Autenticación** — OAuth2/JWT en FastAPI (`fastapi.security`) y sesión en la PWA.
   Ojo con el flujo NFC: la ruta `/activo/{ncf}` debe seguir abriéndose de un toque; lo razonable
   es sesión de larga duración en el dispositivo del inspector, no login por escaneo.
2. **Autorización por rol** — lectura para inspectores, alta/baja solo para administradores.
3. **Limitación de tasa** en `POST /bienes/{ncf}/auditorias`: el NCF es adivinable por
   construcción y sin límite alguien podría falsear un inventario completo.
4. **HTTPS obligatorio** — no es opcional: sin contexto seguro no hay ni geolocalización ni
   Web NFC.
5. **Migraciones con Alembic** en lugar de `create_all()`.
6. **Respaldos** de la tabla `auditorias`, que es el activo documental del sistema.
