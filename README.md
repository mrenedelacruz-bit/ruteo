# ♞ Ajedrez Remoto

Juego de ajedrez para jugar con otra persona **a través de internet**, directo entre los dos
navegadores — sin cuentas, sin backend propio y sin claves de API.

## Cómo se juega

1. **Crear partida**: un jugador pulsa *Crear partida* (eligiendo color o aleatorio). La app
   genera un **código de 5 letras** y un **enlace directo**.
2. **Unirse**: el rival abre el enlace (o escribe el código en *Unirse a una partida*) desde
   cualquier dispositivo — computadora o móvil.
3. A jugar. También hay modo **local** para dos personas en la misma pantalla.

### Funciones

- Reglas completas de ajedrez con [chess.js](https://github.com/jhlywa/chess.js): enroque,
  captura al paso, promoción (con selector de pieza), jaque, mate, ahogado, triple repetición,
  material insuficiente y regla de los 50 movimientos.
- Movimientos legales resaltados, última jugada y jaque marcados en el tablero.
- Lista de jugadas en notación SAN y piezas capturadas.
- Rendirse, ofrecer/aceptar tablas y revancha (con colores intercambiados).
- Chat integrado durante la partida remota.
- Tablero girable y diseño adaptado a móvil.

## Cómo funciona la conexión

Se usa **WebRTC** mediante [PeerJS](https://peerjs.com/): el broker público y gratuito de PeerJS
solo sirve para *emparejar* a los dos jugadores con el código; después, las jugadas y el chat
viajan **directamente entre los dos navegadores** (peer-to-peer). No hay servidor de juego que
mantener.

## Desarrollo

```bash
npm install
npm run dev      # servidor local en http://localhost:5173
npm run build    # genera dist/ listo para publicar
```

Stack: [Vite](https://vite.dev/) + TypeScript (sin framework), `chess.js` para las reglas y
`peerjs` para la conexión.

## Publicación

El workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) compila y
publica en **GitHub Pages** en cada push. Requiere activar Pages en el repositorio:
*Settings → Pages → Source: GitHub Actions*. La app queda disponible en
`https://<usuario>.github.io/ruteo/`.
