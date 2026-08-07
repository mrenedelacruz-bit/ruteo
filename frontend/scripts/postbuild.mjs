/**
 * Pasos posteriores a `vite build`.
 *
 * 1. Copia index.html a 404.html. GitHub Pages sirve solo archivos estáticos y
 *    no sabe nada de rutas del cliente: al pedir /ruteo/activo/NCF-... devolvería
 *    un 404 duro. Con esta copia, Pages entrega la SPA (con estado HTTP 404, que
 *    el navegador ignora) y React Router resuelve la ruta. Esto es justo lo que
 *    hace funcionar el enlace profundo del escaneo NFC.
 * 2. Reescribe start_url/scope/icons del manifest si se compiló con otra base.
 * 3. Deja un .nojekyll para que Pages no filtre archivos que empiezan con "_".
 */

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(RAIZ, 'dist')
const BASE = process.env.VITE_BASE ?? '/ruteo/'

copyFileSync(join(DIST, 'index.html'), join(DIST, '404.html'))
writeFileSync(join(DIST, '.nojekyll'), '')

const rutaManifest = join(DIST, 'manifest.webmanifest')
const manifest = JSON.parse(readFileSync(rutaManifest, 'utf8'))
const rebasar = (url) => BASE + String(url).replace(/^\/ruteo\/|^\//, '')

manifest.start_url = BASE
manifest.scope = BASE
manifest.icons = manifest.icons.map((i) => ({ ...i, src: rebasar(i.src) }))
manifest.shortcuts = (manifest.shortcuts ?? []).map((s) => ({ ...s, url: rebasar(s.url) }))
writeFileSync(rutaManifest, JSON.stringify(manifest, null, 2))

console.log(`✓ 404.html, .nojekyll y manifest rebasado a "${BASE}"`)
