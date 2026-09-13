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
    max-width: none;
    min-width: 0;
  }
}
`
