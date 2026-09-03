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

/* Las dos columnas de la ficha: la cifra y lo que la sitúa a la izquierda, lo
   que la califica a la derecha. Apilan a 1000px y no a 720 porque la columna
   estrecha tiene un suelo real de 300px: entre 720 y 1000 la ecuación de cinco
   celdas quedaba en unos 380px y el coste declarado partía en dos líneas.
   Medido en el navegador. */
.cp-ficha-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 26px;
  align-items: start;
  margin-top: 4px;
}
.cp-ficha-rail { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; }
.cp-ficha-cols > * { min-width: 0; }
@media (max-width: 1000px) {
  .cp-ficha-cols { grid-template-columns: minmax(0, 1fr); gap: 0; }
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

/* El rótulo del eje: año · leyenda · año, sin que se toquen nunca.

   Era un flex con space-between, y space-between reparte lo que SOBRA: cuando
   la leyenda no cabe no sobra nada y los tres hijos se pegan. Publicaba
   «2014banda: mitad central de comparables · - - 2024», con el final del texto
   en una segunda línea y el año de la derecha metido dentro de la frase.

   La rejilla lo arregla en las dos direcciones a la vez. El gap es una
   separación real —no espacio sobrante— así que los años no pueden pegarse a la
   leyenda a ningún ancho; y la columna 1fr deja que la leyenda se encoja
   partiendo por dentro en vez de empujar a sus vecinos.

   La consulta es de CONTENEDOR, no de ventana, y esa es la parte que importa.
   Medido sobre la ficha del agua: la fila mide 786px con la ventana a 1440,
   474 a 1100 y 620 a 900, porque .cp-ficha-cols reparte sus columnas por su
   cuenta. El ancho de la ventana no dice si la leyenda cabe; el de esta caja,
   sí. Un breakpoint de @media habría dejado el defecto vivo en un portátil.

   560px sale de medir: la leyenda más ancha del panel es la de alumbrado
   —«… · €/punto de luz»— con 469px, más 26+26 de los dos años y los dos gaps
   de 12 son 545. Por debajo de eso no cabe en una línea y baja a la suya. */
.cp-serie { container-type: inline-size; }
.cp-serie-eje {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 2px 12px;
  font-size: var(--fs-micro);
  color: var(--ink50);
  margin-top: 4px;
}
.cp-serie-eje-nota { text-align: center; }
@container (max-width: 560px) {
  /* Los años se quedan en su fila, en los extremos, y la leyenda baja entera.

     Y esto es un FLEX, no la misma rejilla con otras columnas. En rejilla la
     nota ocupaba las dos columnas, y un elemento que abarca varias pistas
     reparte su ancho mínimo entre ellas: las dos pistas auto se inflaban a
     157,5px cada una —medido—, se comían el espacio libre y space-between se
     quedaba sin nada que repartir. El «2024» acababa a media fila, dentro de
     una caja de 158px, en vez de en el borde derecho. No lo vio la medida de
     solapes: no chocaba con nada, sólo estaba en el sitio equivocado.

     En flex la nota lleva basis del 100% y se va sola a la segunda línea, sin
     tocar el tamaño de los dos años, que es lo único que hay en la primera. */
  .cp-serie-eje {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    column-gap: 12px;
  }
  .cp-serie-eje-nota {
    order: 1;
    flex: 1 0 100%;
    text-align: left;
  }
}
`
