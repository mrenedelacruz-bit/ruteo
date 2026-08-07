import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` debe coincidir con la ruta pública del sitio. En GitHub Pages el sitio
// del repo `ruteo` se sirve bajo /ruteo/, y esa misma base es la que se usa para
// armar las URLs que se graban en las etiquetas NFC.
// Para un dominio propio (https://bienes.miempresa.com) basta con base: '/'.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/ruteo/',
  plugins: [react()],
  server: {
    // `host: true` expone el dev server en la LAN para poder abrirlo desde el
    // iPhone real. Ojo: la geolocalización y el Web NFC exigen HTTPS o
    // localhost, así que para probar en el teléfono hace falta un túnel TLS.
    host: true,
    port: 5173,
  },
})
