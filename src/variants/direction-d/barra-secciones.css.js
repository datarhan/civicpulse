/**
 * La barra de secciones de la portada, en una hoja de verdad.
 *
 * Regla de la casa: el prop `style` no puede llevar media queries ni
 * pseudo-clases, y aquí hacen falta las dos. El desplegable necesita :hover
 * con su pareja :focus-visible —lo que cambia al pasar el ratón cambia igual
 * al llegar con el teclado—, y por debajo de BARRA_COMPACTA la fila se desliza
 * y los paneles cambian de ancla.
 *
 * El cambio de ancla es lo que no se ve venir. Una fila con overflow-x recorta
 * a todo descendiente cuyo bloque contenedor esté DENTRO de ella, así que un
 * panel anclado a su <li> quedaría cortado a la altura de la barra, justo
 * cuando más falta hace. En estrecho el <li> deja de estar posicionado y el
 * panel se ancla al <nav>, que está fuera del recorte (CSS 2.1, §11.1.1).
 *
 * Los colores salen de PALETTE, como el resto de la portada, que no sigue el
 * modo oscuro a propósito. Tamaños y radios, de la escala: --fs-* y --r-*.
 *
 * Aquí dentro no entra un acento invertido: cerraría el literal a media hoja.
 * Lo vigila css-en-literal.test.js.
 */
import { MONO, PALETTE, SANS } from './tokens'

/**
 * Por debajo de este ancho la fila no cabe entera y se desliza. Medido: los
 * cinco grupos, el índice y la acción suman unos 690 px; a 800 le sobra aire
 * al último panel (el de Laboratorio acaba hacia los 740) sin rozar el borde.
 */
export const BARRA_COMPACTA = 800

export const estiloBarraSecciones = `
.d-sec {
  position: relative;
  z-index: 1010;
  flex-shrink: 0;
  background: ${PALETTE.bg};
  border-bottom: 1px solid ${PALETTE.hair};
  font-family: ${SANS};
}
.d-sec-fila {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 44px;
  margin: 0;
  padding: 0 12px;
  list-style: none;
}
.d-sec-grupo {
  position: relative;
  display: flex;
}

/* ── Los botones ─────────────────────────────────────────────────────── */

.d-sec-boton,
.d-sec-indice {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  white-space: nowrap;
  border-top: 2px solid transparent;
  border-bottom: 2px solid transparent;
}
.d-sec-boton {
  font-size: var(--fs-aux);
  font-weight: 400;
  color: ${PALETTE.ink80};
}
.d-sec-indice {
  font-family: ${MONO};
  font-size: var(--fs-micro);
  letter-spacing: 0.06em;
  color: ${PALETTE.ink50};
}
.d-sec-boton:hover,
.d-sec-boton:focus-visible,
.d-sec-indice:hover,
.d-sec-indice:focus-visible {
  color: ${PALETTE.civic};
}
.d-sec-boton[aria-expanded='true'],
.d-sec-indice[aria-expanded='true'] {
  color: ${PALETTE.civic};
  border-bottom-color: ${PALETTE.civic};
}
.d-sec-boton[aria-expanded='true'] {
  font-weight: 600;
}
/* El anillo del sitio sale 2 px hacia fuera, y en estrecho la fila recorta:
   se lo comería por arriba y por abajo. Hacia dentro se ve siempre. */
.d-sec-boton:focus-visible,
.d-sec-indice:focus-visible {
  outline-offset: -2px;
}

/* El rótulo reserva el ancho de su negrita. Sin esto, abrir un grupo empuja
   un par de píxeles a los de su derecha y la barra tiembla bajo el ratón. */
.d-sec-rotulo {
  display: inline-grid;
}
.d-sec-rotulo > span {
  grid-area: 1 / 1;
}
.d-sec-rotulo-ancho {
  font-weight: 600;
  visibility: hidden;
}
.d-sec-flecha {
  flex-shrink: 0;
}

/* ── Los paneles ─────────────────────────────────────────────────────── */

.d-sec-panel {
  position: absolute;
  top: calc(100% + 1px);
  left: 0;
  width: 360px;
  padding: 12px 14px 14px;
  background: ${PALETTE.paper};
  border: 1px solid ${PALETTE.hair};
  border-top: none;
  border-radius: 0 0 var(--r-card) var(--r-card);
  box-shadow: 0 14px 34px rgba(11, 15, 25, 0.16);
}
/* Una regla de autor con display gana al [hidden] de la hoja del navegador:
   sin esto un panel «cerrado» seguiría pintado. */
.d-sec-panel[hidden] {
  display: none;
}
.d-sec-lema {
  margin: 0 0 8px;
  font-family: ${MONO};
  font-size: var(--fs-micro);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${PALETTE.ink50};
}
.d-sec-lista {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
/* Doble clase a propósito: la regla general que subraya todo enlace dentro
   de un li pesa más que una clase sola, y aquí la fila entera es el enlace. */
.d-sec a.d-sec-enlace {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--r-input);
  color: ${PALETTE.ink60};
  text-decoration: none;
}
.d-sec a.d-sec-enlace:hover,
.d-sec a.d-sec-enlace:focus-visible {
  background: ${PALETTE.civicWash};
  color: ${PALETTE.civic};
}
.d-sec-enlace > [data-section-glyph] {
  margin-top: 1px;
}
.d-sec-textos {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.d-sec-titulo {
  font-size: var(--fs-aux);
  font-weight: 600;
  line-height: 1.25;
  color: ${PALETTE.ink};
}
.d-sec-desc {
  font-size: var(--fs-meta);
  line-height: 1.4;
  color: ${PALETTE.ink60};
}

/* ── El índice: todo a la vista de una vez ───────────────────────────── */

.d-sec-grupo--indice {
  position: static;
  margin-left: auto;
}
.d-sec-panel--indice {
  left: auto;
  right: 12px;
  width: min(880px, calc(100% - 24px));
  padding: 14px 18px 16px;
}
.d-sec-indice-rejilla {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}
.d-sec-indice-rotulo {
  margin: 0 0 4px;
  padding: 0 6px;
  font-size: var(--fs-meta);
  font-weight: 700;
  color: ${PALETTE.ink};
}
.d-sec a.d-sec-enlace--breve {
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
}
.d-sec-enlace--breve .d-sec-titulo {
  font-weight: 500;
}
.d-sec-indice-pie {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 14px;
  margin-top: 14px;
  padding: 12px 6px 0;
  border-top: 1px solid ${PALETTE.hair};
}
.d-sec-indice-pie .d-sec-indice-rotulo {
  margin: 0;
  padding: 0;
}
.d-sec-indice-pie ul {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.d-sec-indice-pie a {
  font-size: var(--fs-meta);
  color: ${PALETTE.civic};
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ── La acción principal ─────────────────────────────────────────────── */

.d-sec-accion {
  display: flex;
  align-items: center;
  padding-left: 6px;
}
/* position: relative no es decoración. El aviso para lectores de pantalla
   (.d-sec-oculto) va en absoluto, y sin un ancestro posicionado DENTRO de la
   fila su bloque contenedor es el <nav>, fuera del recorte: a 375 px, con la
   acción deslizada fuera de la vista, ensanchaba el documento hasta 539 px. */
.d-sec a.d-sec-queja {
  position: relative;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  padding: 6px 12px;
  border-radius: var(--r-input);
  background: ${PALETTE.civic};
  color: #fff;
  font-size: var(--fs-meta);
  font-weight: 600;
  text-decoration: none;
}
.d-sec a.d-sec-queja:hover,
.d-sec a.d-sec-queja:focus-visible {
  background: ${PALETTE.civicInk};
}
.d-sec-oculto {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: ${BARRA_COMPACTA - 1}px) {
  .d-sec-fila {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .d-sec-grupo {
    position: static;
  }
  .d-sec-panel,
  .d-sec-panel--indice {
    left: 12px;
    right: 12px;
    width: auto;
  }
  .d-sec-indice-rejilla {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`
