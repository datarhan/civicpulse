/**
 * Lo responsivo y lo interactivo del índice de plenos, en una hoja de verdad.
 *
 * Regla de la casa: el prop `style` no puede llevar media queries ni
 * pseudo-clases, y aquí hacen falta las dos. La tabla de sesiones tiene siete
 * columnas en escritorio y se convierte en fichas apiladas por debajo de
 * 720px; los chips de filtro necesitan :hover y :focus-visible; y las filas
 * marcan el paso al pasar por encima.
 *
 * A 375px la tabla NO puede scrollear la página: mobile.spec.ts mide
 * scrollWidth - clientWidth === 0 sobre el DOCUMENTO, así que un overflow-x en
 * el contenedor no bastaría si la rejilla siguiera midiendo 900px por dentro.
 * Por eso las celdas pasan a bloque y cada fila se lee como una ficha, con su
 * rótulo delante — el mismo patrón que libro.css.js.
 *
 * Aquí dentro no entra un acento invertido: esto es un template literal y un
 * selector entrecomillado así lo cierra a media hoja. Ya ha pasado cinco
 * veces; lo vigila css-en-literal.test.js.
 */
export const estiloPlenos = `
/* ── Cabecera: el lede y la escalera de cobertura ─────────────────────── */

.cp-plenos-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 40px;
  align-items: start;
}

/* ── La tabla de sesiones ─────────────────────────────────────────────── */

.cp-plenos-tabla { overflow-x: auto; -webkit-overflow-scrolling: touch; }

.cp-plenos-fila,
.cp-plenos-cabecera {
  display: grid;
  grid-template-columns: 128px 116px minmax(140px, 1fr) 116px 112px 104px 20px;
  gap: 12px;
  align-items: center;
}

.cp-plenos-cabecera { align-items: end; }

.cp-plenos-fila {
  padding: 10px 18px;
  border-bottom: 1px solid var(--border2);
  color: inherit;
  text-decoration: none;
  transition: background var(--motion-fast) var(--ease-fast);
}

.cp-plenos-fila:hover { background: var(--soft); }

.cp-plenos-fila:focus-visible { background: var(--soft); }

/* El rótulo de celda sólo existe en móvil, donde la fila deja de tener
   cabecera encima. En escritorio lo lee la columna — por eso el rótulo de la
   celda va abreviado («Puntos») y el de la columna entero («Puntos del orden
   del día»): el largo no cabe en media ficha de 375px. */
.cp-plenos-rotulo { display: none; }

/* ── Chips de filtro ──────────────────────────────────────────────────── */

.cp-plenos-chip {
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  letter-spacing: .04em;
  padding: 4px 11px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--paper);
  color: var(--ink70);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--motion-fast) var(--ease-fast),
    border-color var(--motion-fast) var(--ease-fast),
    color var(--motion-fast) var(--ease-fast);
}

.cp-plenos-chip:hover { border-color: var(--civic); color: var(--civic); }

.cp-plenos-chip[aria-pressed='true'] {
  background: var(--civic);
  border-color: var(--civic);
  color: var(--civic-on);
}

/* ── Las dos tarjetas de abajo y el reparto por área ──────────────────── */

.cp-plenos-duo {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: start;
}

.cp-plenos-area {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr) 34px;
  gap: 12px;
  align-items: center;
  color: inherit;
  text-decoration: none;
  padding: 2px 4px;
  border-radius: var(--r-input);
  transition: background var(--motion-fast) var(--ease-fast);
}

.cp-plenos-area:hover { background: var(--soft); }

.cp-plenos-pie {
  display: flex;
  gap: 24px;
  align-items: baseline;
  flex-wrap: wrap;
  border-top: 1px solid var(--border);
  padding-top: 18px;
}

/* ── Móvil ────────────────────────────────────────────────────────────── */

@media (max-width: 900px) {
  .cp-plenos-hero { grid-template-columns: minmax(0, 1fr); gap: 22px; }
  .cp-plenos-duo { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 720px) {
  /* La cabecera de columnas desaparece: cada celda se rotula sola. */
  .cp-plenos-cabecera { display: none; }

  .cp-plenos-tabla { overflow-x: visible; }

  /* Seis celdas apiladas daban una ficha de 170px, y 61 de ésas son diez mil
     píxeles de scroll. Fecha y tipo comparten la primera línea —son la
     cabecera de la ficha— y las cuatro cifras van debajo, una por línea.

     Las cifras NO van a dos columnas, y se probó: media ficha de 375px son
     164px, y «VOTACIONES» junto a su etiqueta «sin transcribir» mide 187. El
     desborde era de 12px y la etiqueta se comía la columna de al lado. Es
     precisamente la fila más común —54 de 61 sesiones no tienen votación
     transcrita— así que no era un caso raro: era el caso. */
  .cp-plenos-fila {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 14px;
    row-gap: 2px;
    padding: 12px 14px;
  }

  .cp-plenos-fila > :nth-child(2) { justify-self: end; }

  .cp-plenos-fila > :nth-child(n + 3) { grid-column: 1 / -1; }

  .cp-plenos-celda {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 3px 0;
    min-width: 0;
  }

  /* Fecha y tipo no llevan rótulo: una fecha y una pastilla se leen solas. */
  .cp-plenos-fila > :nth-child(-n + 2) .cp-plenos-rotulo { display: none; }

  .cp-plenos-rotulo {
    display: inline;
    font-size: var(--fs-micro);
    color: var(--ink50);
    text-transform: uppercase;
    letter-spacing: .05em;
  }

  /* La flecha de «entrar» no aporta nada cuando la fila entera es la ficha. */
  .cp-plenos-flecha { display: none; }

  .cp-plenos-area { grid-template-columns: minmax(0, 1fr) 34px; }
  .cp-plenos-area > .cp-plenos-area-barra { grid-column: 1 / -1; grid-row: 2; }
}
`
