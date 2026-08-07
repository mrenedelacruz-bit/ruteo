/**
 * Genera los íconos PNG de la PWA sin dependencias externas.
 *
 * Se escribe el PNG a mano (IHDR + IDAT deflate + IEND) en vez de arrastrar
 * sharp/canvas al proyecto: son cuatro archivos estáticos que cambian una vez
 * al año, no justifican 40 MB de node_modules ni un binario nativo por plataforma.
 *
 * Uso:  node scripts/generar-iconos.mjs
 */

import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = join(RAIZ, 'public', 'icons')

// Paleta: la misma del tema oscuro de la app.
const FONDO = [17, 24, 39] // slate-900
const ACENTO = [245, 158, 11] // amber-500
const CLARO = [248, 250, 252] // slate-50

// --------------------------------------------------------------------------- //
// Escritura de PNG                                                            //
// --------------------------------------------------------------------------- //

/** Empaqueta un chunk PNG: longitud + tipo + datos + CRC32. */
function chunk(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo) >>> 0)
  return Buffer.concat([largo, cuerpo, crc])
}

/** Serializa un buffer RGBA (ancho*alto*4) a un PNG de color verdadero. */
function png(rgba, ancho, alto) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8 // 8 bits por canal
  ihdr[9] = 6 // color type 6 = RGBA
  // 10..12 = compresión/filtro/entrelazado, todos 0 (valores por defecto)

  // Cada scanline va precedida por su byte de filtro; 0 = sin filtro.
  const crudo = Buffer.alloc((ancho * 4 + 1) * alto)
  for (let y = 0; y < alto; y++) {
    crudo[y * (ancho * 4 + 1)] = 0
    rgba.copy(crudo, y * (ancho * 4 + 1) + 1, y * ancho * 4, (y + 1) * ancho * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --------------------------------------------------------------------------- //
// Dibujo del glifo NFC                                                        //
// --------------------------------------------------------------------------- //

/**
 * Cobertura antialiaseada de un punto: se muestrea 3x3 dentro del píxel y se
 * promedia. Sin esto los arcos se ven dentados a 192 px.
 */
function cobertura(x, y, dentro) {
  let aciertos = 0
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      if (dentro(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) aciertos++
    }
  }
  return aciertos / 9
}

/** Mezcla `color` sobre el píxel (x,y) con opacidad `alfa`. */
function pintar(buf, ancho, x, y, color, alfa) {
  if (alfa <= 0) return
  const i = (y * ancho + x) * 4
  for (let c = 0; c < 3; c++) {
    buf[i + c] = Math.round(buf[i + c] * (1 - alfa) + color[c] * alfa)
  }
  buf[i + 3] = Math.max(buf[i + 3], Math.round(255 * alfa))
}

/**
 * Dibuja el ícono a tamaño S.
 * @param {number} S lado en píxeles
 * @param {boolean} maskable si es true, el glifo se encoge al 60 % para
 *   sobrevivir el recorte circular de Android (zona segura del 80 %).
 */
function dibujar(S, maskable) {
  const buf = Buffer.alloc(S * S * 4) // arranca transparente
  const escala = maskable ? 0.62 : 0.78
  const cx = S / 2
  const cy = S / 2
  const radioEsquina = maskable ? S / 2 : S * 0.22

  // Fondo: cuadrado redondeado (círculo completo si es maskable).
  const dentroFondo = (x, y) => {
    const dx = Math.max(Math.abs(x - cx) - (S / 2 - radioEsquina), 0)
    const dy = Math.max(Math.abs(y - cy) - (S / 2 - radioEsquina), 0)
    return Math.hypot(dx, dy) <= radioEsquina
  }

  // Cuerpo del "teléfono": rectángulo redondeado vertical al centro.
  const anchoTel = S * 0.20 * escala
  const altoTel = S * 0.46 * escala
  const rTel = S * 0.045 * escala
  const dentroTelefono = (x, y) => {
    const dx = Math.max(Math.abs(x - cx) - (anchoTel / 2 - rTel), 0)
    const dy = Math.max(Math.abs(y - cy) - (altoTel / 2 - rTel), 0)
    return Math.hypot(dx, dy) <= rTel
  }

  // Ondas: dos arcos por lado, a ±60° de la horizontal.
  const grosor = S * 0.035 * escala
  const radios = [S * 0.19 * escala, S * 0.27 * escala]
  const dentroOndas = (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const r = Math.hypot(dx, dy)
    // Solo el sector horizontal: |dy| < |dx| * tan(60°)
    if (Math.abs(dy) > Math.abs(dx) * 1.732) return false
    if (Math.abs(dx) < anchoTel / 2 + grosor * 0.8) return false
    return radios.some((rr) => Math.abs(r - rr) <= grosor / 2)
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      pintar(buf, S, x, y, FONDO, cobertura(x, y, dentroFondo))
      pintar(buf, S, x, y, CLARO, cobertura(x, y, dentroTelefono))
      pintar(buf, S, x, y, ACENTO, cobertura(x, y, dentroOndas))
    }
  }
  return png(buf, S, S)
}

// --------------------------------------------------------------------------- //

mkdirSync(SALIDA, { recursive: true })

const archivos = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  // iOS ignora el manifest para el ícono de pantalla de inicio y usa
  // <link rel="apple-touch-icon">, que además no admite transparencia.
  ['apple-touch-icon.png', 180, false],
]

for (const [nombre, tamano, maskable] of archivos) {
  writeFileSync(join(SALIDA, nombre), dibujar(tamano, maskable))
  console.log(`✓ icons/${nombre} (${tamano}×${tamano})`)
}
