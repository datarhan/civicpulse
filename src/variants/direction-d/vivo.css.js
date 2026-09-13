/**
 * La tira de datos vivos de la cabecera —tiempo, aire y metro— y su detalle.
 *
 * Aquí está el arreglo del defecto que la maqueta llamaba «el popover no se
 * pinta nunca», y no era el z-index. El detalle se anclaba a la propia tira, y
 * la tira necesita deslizarse en estrecho, así que lleva overflow-x. Una caja
 * con overflow distinto de visible RECORTA a todo descendiente cuyo bloque
 * contenedor esté dentro de ella —CSS 2.1, §11.1.1—, de modo que el panel
 * quedaba cortado a la altura de la fila: 22 píxeles de un panel de 300.
 *
 * Por eso el panel ya no cuelga de la tira. Cuelga del envoltorio, que es quien
 * está posicionado y NO se desliza; la tira es su hermana. Y por debajo de
 * STACK_BREAKPOINT, donde la cabecera se envuelve en varias filas y un panel
 * anclado a la derecha del envoltorio se saldría de la pantalla, el envoltorio
 * deja de estar posicionado y el panel se ancla a `.d-topbar`, que está fuera
 * de cualquier recorte. Es el mismo cambio de ancla que hace la barra de
 * secciones, por la misma razón.
 *
 * Aquí dentro no entra un acento invertido: cerraría el literal a media hoja.
 * Lo vigila css-en-literal.test.js, que descubre las hojas solo.
 */
import { MONO, PALETTE, SANS, STACK_BREAKPOINT } from './tokens'

export const estiloVivo = `
.cp-vivo {
  /* El ancla del panel, y NO un contenedor de desplazamiento. */
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  font-family: ${SANS};
}

.cp-vivo-tira {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  border-radius: var(--r-input);
  background: ${PALETTE.bg};
  border: 1px solid ${PALETTE.hair};
  /* Se encoge y se desliza antes que empujar la cabecera más allá de la
     ventana. Como flex-shrink: 0 se quedaba con sus ~476 px y sacaba el
     documento de cuadro desde 1024 hacia abajo. */
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.cp-vivo-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 2px 6px;
  border: none;
  border-radius: var(--r-input);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

/* Lo que cambia con el ratón cambia igual llegando con el teclado. */
.cp-vivo-chip:hover,
.cp-vivo-chip:focus-visible {
  background: ${PALETTE.civicWash};
}

.cp-vivo-chip[aria-expanded='true'] {
  background: ${PALETTE.civicWash};
}

.cp-vivo-sep {
  width: 1px;
  height: 18px;
  flex-shrink: 0;
  background: ${PALETTE.hair};
}

.cp-vivo-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  min-width: 300px;
  max-width: 340px;
  padding: 14px 16px 12px;
  border: 1px solid ${PALETTE.hair};
  border-radius: var(--r-card);
  background: ${PALETTE.paper};
  box-shadow: 0 12px 32px rgba(11, 15, 25, 0.12);
  font-family: ${SANS};
  /* La portada de escritorio es un shell de 100vh: no desplaza el documento, así
     que un panel más alto que la ventana no se alcanza NUNCA. Con las tres
     secciones dentro mide 871 px medidos en una ventana de 900, y la última —el
     metro— se quedaba fuera de la pantalla: igual de inalcanzable que cuando el
     detalle no se pintaba, que es el defecto del que sale todo esto. Se desplaza
     por dentro. El descuento son la cabecera (54) más el hueco del ancla (8) más
     aire para no pegarlo al borde. */
  max-height: calc(100vh - 84px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.cp-vivo-fuente {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid ${PALETTE.hair};
  font-family: ${MONO};
  font-size: var(--fs-micro);
  letter-spacing: 0.04em;
  color: ${PALETTE.ink50};
}

@media (max-width: ${STACK_BREAKPOINT - 1}px) {
  /* El envoltorio deja de ser el ancla y el panel se cuelga de la cabecera, que
     ocupa el ancho entero y no recorta. Anclado a la derecha del envoltorio, en
     una cabecera envuelta en tres filas, el panel se salía de la pantalla. */
  .cp-vivo {
    position: static;
  }

  .cp-vivo-panel {
    left: 14px;
    right: 14px;
    /* Con las dos anclas puestas y sin tope, el panel se estiraba de lado a lado
       de la cabecera: medido, 872 px de losa en una ventana de 900. Anclarlo a la
       cabecera hacía falta para que a 375 no se saliera, no para convertirlo en
       una franja. El tope lo corta, y el margen automático de la izquierda
       resuelve la sobrerrestricción pegándolo al borde derecho, que es donde está
       el chip. A 375 el hueco disponible (347) ya es menor que el tope, así que
       ahí no cambia nada y sigue cabiendo entero.

       (Y sí: la primera versión de este comentario citaba la propiedad entre
       acentos invertidos y cerró el literal a media hoja. Lo dice el encabezado
       de este fichero, cuatro líneas de nada más arriba.) */
    max-width: 380px;
    margin-left: auto;
    min-width: 0;
    /* Aquí el ancla es la cabecera, y envuelta mide 116 px medidos a 375: el tope
       tiene que descontar eso o el panel se vuelve a salir por abajo. */
    max-height: calc(100vh - 150px);
  }
}
`
