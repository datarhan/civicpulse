/**
 * Lo responsivo de la ficha de un servicio.
 *
 * Igual que la hoja del libro, y por la misma regla de la casa: los estilos
 * inline no pueden llevar media queries. Y aquí hacen falta — la ecuación es
 * una división en cinco columnas, y a 375px cinco columnas no caben: «3.210.292
 * €» partía el símbolo del euro a la línea siguiente y «100,35 €/m²» quedaba en
 * dos.
 *
 * A partir de 720px la ecuación se reordena en lugar de encogerse: el resultado
 * sube arriba y la división queda debajo en una sola línea, que es la forma en
 * que la propuesta la dibuja para móvil. El signo «=» sobra entonces y se cae;
 * el «÷» se queda, porque sin él dos cifras juntas dejan de ser una división.
 *
 * (Ningún acento invertido aquí dentro: cerraría el literal a media hoja.)
 */
export const estiloFicha = `
.cp-ecuacion {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto auto;
  grid-template-areas: "num div den eq res";
  gap: 12px;
  align-items: center;
  margin-top: 18px;
  padding: 16px;
  background: var(--surf);
  border: 1px solid var(--border2);
  border-radius: var(--r-card);
}
.cp-eq-num { grid-area: num; }
.cp-eq-div { grid-area: div; }
.cp-eq-den { grid-area: den; }
.cp-eq-eq  { grid-area: eq; }
.cp-eq-res { grid-area: res; text-align: right; }

@media (max-width: 720px) {
  .cp-ecuacion {
    grid-template-columns: auto auto 1fr;
    grid-template-areas:
      "res res res"
      "num div den";
    gap: 4px 10px;
    align-items: start;
  }
  .cp-eq-res { text-align: left; }
  .cp-eq-eq { display: none; }
  .cp-eq-div { align-self: center; }
  .cp-ecuacion > * { min-width: 0; }
}

/* Los cinco cuantiles caen cada uno en su sitio porque space-between los
   reparte en 0/25/50/75/100. A 375px no caben en una línea, y envueltos dejan
   de aterrizar donde dicen: «p25» acabaría en cualquier parte. Se quedan tres
   —los extremos y la mediana—, que con space-between siguen cayendo en 0, 50 y
   100. Es la misma regla que rige el eje: antes menos rótulos que rótulos en el
   sitio equivocado. */
.cp-cuantiles { flex-wrap: nowrap; }
@media (max-width: 720px) {
  .cp-cuantil-medio { display: none; }
}
`
