/**
 * Lo responsivo del libro de servicios, en una hoja y no en el prop `style`.
 *
 * Regla de la casa, y la dice el docblock de `SubnavSecciones`: los estilos
 * inline no pueden llevar media queries ni pseudo-clases. Aquí hacen falta las
 * dos cosas — la tabla de ocho columnas se convierte en fichas apiladas por
 * debajo de 720px, y las cabeceras ordenables necesitan `:hover` y
 * `:focus-visible`.
 *
 * A 375px la tabla NO scrollea la página: `td` y `tr` pasan a bloque y cada
 * fila se lee como en la propuesta móvil. `mobile.spec.ts` mide
 * `scrollWidth - clientWidth === 0` sobre el documento, así que un
 * `overflow-x` en el contenedor no bastaría si la tabla siguiera midiendo
 * 1240px por dentro.
 */
export const estiloLibro = `
.cp-libro-wrap { margin-top: 14px; }

/* La tabla scrollea DENTRO de su caja, nunca la página. El .cp-scroll-x de
   index.css no vale aquí: sólo enciende el overflow por debajo de 720px, así
   que en escritorio el min-width de la tabla empujaba el documento seis
   píxeles a la derecha. Medido con getBoundingClientRect, que es lo único que
   ve una barra de scroll horizontal — ninguna suite de esta casa la ve.

   Aquí dentro no entra un acento invertido: esto es un template literal, y un
   nombre entrecomillado así lo cierra a media hoja. La primera versión de este
   comentario lo hizo, prettier reformateó lo que quedaba como si fuera código
   y la página entera murió con un ReferenceError que ninguna prueba unitaria
   de esta casa puede ver. */
.cp-libro-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

.cp-libro-filtros {
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
  padding-bottom: 12px;
}
.cp-libro-filtros-rotulo {
  font-size: var(--fs-micro); color: var(--ink50);
  text-transform: uppercase; letter-spacing: .06em; margin-right: 2px;
}
.cp-chip {
  padding: 5px 11px; border-radius: var(--r-pill);
  background: var(--paper); border: 1px solid var(--border);
  color: var(--ink70); font-size: var(--fs-meta); font-family: inherit;
  cursor: pointer; white-space: nowrap;
}
.cp-chip:hover { border-color: var(--civic); color: var(--civic-ink); }
.cp-chip-on {
  background: var(--civic); border-color: var(--civic);
  color: var(--civic-on); font-weight: 600;
}

.cp-libro { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 1080px; }
.cp-libro-caption {
  caption-side: top; text-align: left; padding-bottom: 8px;
  font-size: var(--fs-meta); color: var(--ink50);
}
.cp-libro th {
  text-align: left; padding: 10px 7px; vertical-align: bottom;
  border-bottom: 1px solid var(--border);
  font-family: var(--font-mono); font-weight: 400;
  font-size: var(--fs-micro); text-transform: uppercase;
  letter-spacing: .06em; color: var(--ink50);
}
.cp-orden {
  font: inherit; color: inherit; background: none; border: 0;
  padding: 0; cursor: pointer; text-transform: inherit; letter-spacing: inherit;
}
.cp-orden:hover { color: var(--civic-ink); }
.cp-libro td {
  padding: 13px 7px; vertical-align: middle;
  border-bottom: 1px solid var(--border2); font-size: var(--fs-aux);
}
.cp-libro .cp-c-coste, .cp-libro .cp-c-unidad, .cp-libro .cp-c-razon { text-align: right; }
.cp-libro th.cp-c-coste, .cp-libro th.cp-c-unidad, .cp-libro th.cp-c-razon { text-align: right; }
.cp-libro .cp-c-coste { color: var(--ink70); font-size: var(--fs-meta); }
.cp-libro .cp-c-unidad { font-weight: 500; }

.cp-c-servicio { width: 19%; }
.cp-c-coste { width: 8%; }
.cp-c-unidad { width: 12%; }
.cp-c-posicion { width: 19%; }
.cp-c-razon { width: 8%; }
.cp-c-decada { width: 8%; }
.cp-c-decir { width: 14%; }
.cp-c-responde { width: 12%; }
.cp-libro th.cp-c-razon, .cp-libro th.cp-c-decada { white-space: nowrap; }
.cp-libro .cp-c-unidad { white-space: nowrap; }

.cp-libro .cp-c-servicio a { font-weight: 600; color: var(--civic-ink); }
.cp-libro .cp-c-servicio a:hover { text-decoration: underline; }
.cp-libro .cp-c-responde a { color: var(--civic-ink); text-decoration: underline;
  text-underline-offset: 2px; }
.cp-fila-meta {
  display: block; margin-top: 3px;
  font-size: var(--fs-micro); color: var(--ink50); line-height: 1.35;
}
.cp-c-posicion .cp-fila-meta { margin-top: 5px; }

/* El ámbar es SIEMPRE un hecho sobre la declaración, nunca sobre el coste. */
.cp-fila-declara {
  display: flex; align-items: center; gap: 5px; margin-top: 5px;
  font-size: var(--fs-micro); color: var(--warn-ink); line-height: 1.35;
}
.cp-punto-warn {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--warn); flex-shrink: 0;
}

.cp-veredicto {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: var(--r-pill);
  font-size: var(--fs-micro); font-weight: 600; white-space: nowrap;
}
.cp-veredicto-solido { background: var(--soft); color: var(--ink); }
/* Discontinuo = «esto no es una afirmación firme», la misma convención que
   MachineProposal. Aquí, una posición que la muestra no sostiene. */
.cp-veredicto-discontinuo {
  border: 1px dashed var(--ink20); color: var(--ink50);
}

@media (max-width: 720px) {
  .cp-libro { min-width: 0; table-layout: auto; }
  /* Con la tabla en display:block, un table-caption se queda encajonado en la
     anchura de la primera celda: el pie salía en una columna de 120px y doce
     líneas. Vuelve a bloque. (Aquí dentro no entra un acento invertido: cerraría
     el literal. Van dos veces ya.) */
  .cp-libro caption { display: block; width: auto; }
  /* El espaciador que separa los filtros del botón de agrupar empuja el botón
     a una fila propia. En una pantalla estrecha eso es una fila entera para un
     control secundario. */
  .cp-libro-filtros > span[style] { display: none; }
  .cp-libro thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .cp-libro, .cp-libro tbody, .cp-libro tr, .cp-libro td { display: block; width: auto; }
  .cp-libro tr { border-bottom: 1px solid var(--border2); padding: 14px 0; }
  .cp-libro td { border: 0; padding: 0; }
  .cp-libro td + td { margin-top: 6px; }

  /* La serie y el coste total se leen en la ficha: a 375px una raya de 88px y
     un total de siete cifras compiten con lo único que hace falta aquí, que es
     poder recorrer quince servicios. El coste total no se pierde — baja a la
     línea de meta de la posición. */
  .cp-libro .cp-c-decada { display: none; }
  .cp-libro .cp-c-coste {
    display: inline; font-size: var(--fs-micro); color: var(--ink50);
  }
  .cp-libro .cp-c-coste::after { content: ' de coste declarado'; }

  .cp-libro .cp-c-servicio {
    display: flex; flex-wrap: wrap; align-items: baseline;
    justify-content: space-between; gap: 6px;
  }
  .cp-libro .cp-c-servicio .cp-fila-meta { flex-basis: 100%; margin-top: 2px; }
  .cp-libro .cp-c-unidad {
    display: block; text-align: left; margin-top: 2px;
    font-size: var(--fs-aux);
  }
  .cp-libro .cp-c-razon { display: inline; text-align: left; }
  .cp-libro .cp-c-razon::after { content: ' la mediana'; color: var(--ink50); }
  .cp-libro .cp-c-decir { margin-top: 8px; }
}

.cp-libro tr.cp-grupo th {
  padding: 22px 7px 6px; border-bottom: 1px solid var(--border);
  font-family: var(--font-body); font-size: var(--fs-body); font-weight: 650;
  text-transform: none; letter-spacing: -.01em; color: var(--ink);
}
.cp-grupo-frase {
  display: block; margin-top: 3px; font-family: var(--font-body);
  font-size: var(--fs-meta); font-weight: 400; color: var(--ink50);
}
@media (max-width: 720px) {
  .cp-libro tr.cp-grupo { padding: 0; border: 0; }
  .cp-libro tr.cp-grupo th { display: block; padding: 20px 0 4px; }
}

/* Un hecho de la NORMA, no una opinión nuestra: es el único sitio de estas dos
   páginas donde entra el color crítico, y entra porque un umbral legal sí es un
   umbral. La posición sigue sin colorearse nunca. */
.cp-veredicto-fuera { background: var(--crit-soft); color: var(--crit-ink); }

.cp-libro-gestion { min-width: 900px; }
.cp-libro-gestion .cp-c-servicio { width: 24%; }
.cp-libro-gestion .cp-c-unidad { width: 11%; }
.cp-libro-gestion .cp-c-posicion { width: 25%; }
.cp-libro-gestion .cp-c-decada { width: 15%; }
.cp-libro-gestion .cp-c-decir { width: 14%; }
.cp-libro-gestion .cp-c-responde { width: 11%; }
@media (max-width: 720px) {
  .cp-libro-gestion { min-width: 0; }
  /* Los anchos por columna son más específicos que el width:auto con el que la
     tabla se desapila, así que en bloque sobrevivían: cada celda se quedaba en
     el 24 % del ancho del móvil y la página entera salía en una columna de
     180px. El libro de servicios no lo notaba porque sus anchos van sin
     prefijo de tabla. */
  .cp-libro-gestion td,
  .cp-libro-gestion th,
  .cp-libro-gestion .cp-c-servicio,
  .cp-libro-gestion .cp-c-unidad,
  .cp-libro-gestion .cp-c-posicion,
  .cp-libro-gestion .cp-c-decada,
  .cp-libro-gestion .cp-c-decir,
  .cp-libro-gestion .cp-c-responde {
    width: auto;
  }
}
`
