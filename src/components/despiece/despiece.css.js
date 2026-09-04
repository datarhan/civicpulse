/**
 * Las reglas del despiece que NO caben en un `style` inline.
 *
 * Los estilos inline no pueden llevar media queries y además ganan a las
 * clases, así que todo lo que responda al ancho vive aquí y se inyecta en un
 * bloque de estilo, como hace `libro.css.js`.
 *
 * OJO: ni un acento invertido dentro de esta plantilla. Un backtick aquí corta
 * la cadena y deja la página con un ReferenceError que ninguna prueba unitaria
 * ve — ya pasó, y por eso existe tests/css-en-literal.test.js.
 */
export const estiloDespiece = `
.cp-desp {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}
.cp-desp-lista {
  max-height: 72vh;
  overflow-y: auto;
}
.cp-desp-lienzo {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.cp-desp-nodo { cursor: pointer; }
.cp-desp-nodo:focus-visible rect {
  stroke: var(--civic);
  stroke-width: 2;
}
/*
 * Las filas de mantenimiento. Vivían con anchos mínimos en el style inline y
 * desbordaban la página 83 px: los estilos inline no pueden llevar media
 * queries, así que el ancho mínimo no podía ceder en pantalla estrecha. Medido
 * en el navegador, que es lo único que lo ve.
 */
.cp-desp-mant li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}
.cp-desp-mant li > span:first-child { min-width: 190px; }
.cp-desp-mant li > span:nth-child(2) { min-width: 200px; }
.cp-desp-mant li > span:last-child { flex: 1 1 12rem; min-width: 0; }
@media (max-width: 720px) {
  .cp-desp-mant li > span { min-width: 0 !important; flex-basis: 100%; }
}
@media (max-width: 900px) {
  .cp-desp { grid-template-columns: minmax(0, 1fr); }
  .cp-desp-lista { max-height: 220px; }
}
`
