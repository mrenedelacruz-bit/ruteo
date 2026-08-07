/**
 * Empaqueta la app en un único archivo HTML autocontenido.
 *
 * Para qué: publicar un demo en un hosting que solo acepta una página suelta,
 * o entregar la app en un pendrive / adjunto para abrirla con doble clic.
 * Nada de peticiones externas, ningún servidor, ninguna ruta que configurar.
 *
 * Depende de una compilación hecha con:
 *   VITE_ROUTER=hash      — sin reenvío del servidor, la ruta va tras el '#'
 *   VITE_SW=off           — no hay sw.js que registrar en un archivo suelto
 *   VITE_TILE_URL=''      — opcional, para entornos sin salida a internet
 *
 * Salida: `dist-demo/demo.html` — un fragmento (sin <html>/<head>/<body>), que
 * es lo que esperan los alojadores de artefactos; cualquier navegador lo abre
 * igual porque completa esa estructura por su cuenta.
 *
 * Uso:  npm run build:demo
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(RAIZ, 'dist')
const SALIDA = join(RAIZ, 'dist-demo')

const html = readFileSync(join(DIST, 'index.html'), 'utf8')

/** Extrae las rutas de los recursos generados por Vite. */
function recursos(patron) {
  return [...html.matchAll(patron)].map((m) => m[1].replace(/^.*\/assets\//, 'assets/'))
}

const scripts = recursos(/<script[^>]+src="([^"]+)"/g)
const estilos = recursos(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)

if (scripts.length !== 1) {
  // Con varios chunks los `import` relativos entre ellos ya no resolverían al
  // estar todo en línea. Hay que desactivar el troceado antes de empaquetar.
  throw new Error(
    `Se esperaba un único bundle JS y se encontraron ${scripts.length}. ` +
      'Revise la configuración de troceado de Vite.',
  )
}

const leer = (ruta) => readFileSync(join(DIST, ruta), 'utf8')
const css = estilos.map(leer).join('\n')
const js = leer(scripts[0])

// `</script>` dentro de una cadena del bundle cerraría la etiqueta antes de
// tiempo; se parte en dos para que el analizador de HTML no lo reconozca.
const jsSeguro = js.replace(/<\/script>/gi, '<\\/script>')

const salida = `<title>Bienes NFC — demo</title>
<style>
${css}
</style>

<div id="root"></div>

<script type="module">
${jsSeguro}
</script>
`

mkdirSync(SALIDA, { recursive: true })
writeFileSync(join(SALIDA, 'demo.html'), salida)

const kb = (n) => `${Math.round(n / 1024)} kB`
console.log(
  `✓ dist-demo/demo.html — ${kb(salida.length)} ` +
    `(JS ${kb(js.length)} + CSS ${kb(css.length)}), sin recursos externos`,
)
