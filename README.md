# Bienes NFC — inventario y geolocalización de bienes muebles

Sistema web móvil (PWA) para gestionar, inventariar y geolocalizar bienes muebles identificados
con etiquetas NFC. Cada activo lleva una etiqueta con su código **NCF**; al acercar el iPhone, se
abre su ficha y se registra la auditoría de presencia con la posición GPS del momento.

<!-- El proyecto convive en este repositorio con `battalla-naval/`, que es independiente. -->

## Qué incluye

- **Mapa interactivo** con pines de color por estado del bien y actualización de ubicación desde
  el GPS del teléfono.
- **Ruta `/activo/{NCF}`** que abre directamente el escaneo NFC del iPhone, sin ninguna app
  instalada.
- **Panel de administración** con alta de bienes, generación automática del NCF, listado
  filtrable y cambio de estado.
- **Preparación de etiquetas**: la URL exacta a grabar, con cálculo de bytes por tipo de chip, y
  grabado directo desde el navegador en Android.
- **API REST** documentada (FastAPI + OpenAPI) con bitácora de auditoría inmutable.
- **Funciona sin conexión**: service worker para la app, y cola de reintentos para las auditorías
  hechas sin señal.

## Cómo arrancar

### Frontend (solo, en modo local)

Sin backend: los datos se guardan en el navegador. Suficiente para probar el flujo NFC completo.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173/ruteo/
```

### Con backend

```bash
# Terminal 1
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
# API en http://localhost:8000  ·  Documentación en http://localhost:8000/docs

# Terminal 2
cd frontend
echo 'VITE_API_BASE=http://localhost:8000/api/v1' > .env.local
npm run dev
```

### Pruebas

```bash
cd backend && .venv/bin/pytest -q      # 12 pruebas
cd frontend && npm run build           # incluye verificación de tipos
```

## Probar en un iPhone real

La geolocalización y el NFC exigen **HTTPS o localhost**; en el iPhone, `localhost` es el propio
teléfono, así que el dev server de la LAN no basta. Hace falta un túnel TLS:

```bash
npx localtunnel --port 5173     # o cloudflared / ngrok
```

Después, en el iPhone: abra la URL del túnel → compartir → **Agregar a pantalla de inicio**. La
app se abre entonces a pantalla completa, sin barra de Safari.

## Configuración

| Variable | Dónde | Por defecto | Para qué |
|---|---|---|---|
| `VITE_API_BASE` | `frontend/.env.local` | *(vacío)* | URL de la API. Vacío = modo local (`localStorage`). |
| `VITE_BASE` | entorno de compilación | `/ruteo/` | Ruta pública del sitio. `/` para un dominio propio. |
| `DATABASE_URL` | `backend/.env` | SQLite local | `postgresql+psycopg://…` en producción. |
| `CORS_ORIGINS` | `backend/.env` | localhost + Pages | Orígenes autorizados, separados por coma. |
| `PUBLIC_BASE_URL` | `backend/.env` | GitHub Pages | Base de las URLs que se graban en las etiquetas. |

## Etiquetas NFC

Guía completa de grabado desde iPhone con NFC Tools, incluidos el bloqueo de etiquetas y el
etiquetado en lote: **[docs/GUIA-NFC-IPHONE.md](docs/GUIA-NFC-IPHONE.md)**.

En resumen: en la etiqueta se graba **una URL** con un registro NDEF de tipo **URI**, no texto:

```
https://mrenedelacruz-bit.github.io/ruteo/activo/NCF-202608-MOB-0042K
```

- **Grabar** requiere la app NFC Tools — Safari no puede escribir en el chip NFC (restricción de
  iOS, no de esta app). Se hace una sola vez por etiqueta.
- **Leer** no requiere ninguna app: iOS detecta la etiqueta en segundo plano (iPhone XS o
  posterior) y muestra una notificación que abre la ficha.

## El código NCF

```
NCF-202608-MOB-0042K
 │    │     │   │  └── carácter verificador (base36, ponderado por posición)
 │    │     │   └───── correlativo del mes dentro de la categoría
 │    │     └───────── código de categoría (MOB, EQC, EQO, VEH, MAQ, OTR)
 │    └─────────────── año y mes del alta
 └──────────────────── prefijo fijo
```

El verificador detecta tanto dígitos cambiados como transposiciones, así que un código mal
tecleado da un `422` con explicación en vez de un «no encontrado» ambiguo.

## Arquitectura

Decisiones tecnológicas, estructura de carpetas, tabla de endpoints, diagrama del flujo de
lectura y pendientes de seguridad: **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**.

## Estado del proyecto

Prototipo funcional y probado, **sin autenticación**. Antes de un despliegue real hay que añadir
login, autorización por rol y limitación de tasa; el detalle está en la sección de seguridad de
`docs/ARQUITECTURA.md`.
