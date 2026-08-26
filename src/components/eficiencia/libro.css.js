/**
 * Lo responsivo del libro de servicios, en una hoja y no en el prop `style`.
 *
 * Regla de la casa, y la dice el docblock de `SubnavSecciones`: los estilos
 * inline no pueden llevar media queries ni pseudo-clases. Aquí hacen falta las
 * dos cosas — la tabla se convierte en fichas apiladas por debajo de 720px, y
 * las cabeceras ordenables necesitan `:hover` y `:focus-visible`.
 *
 * A 375px la tabla NO scrollea la página: `td` y `tr` pasan a bloque y cada
 * fila se lee como en la propuesta móvil. `mobile.spec.ts` mide
 * `scrollWidth - clientWidth === 0` sobre el documento, así que un
 * `overflow-x` en el contenedor no bastaría si la tabla siguiera midiendo
 * 1240px por dentro.
 *
 * OCHO COLUMNAS A CINCO. La revisión midió lo que ya se veía: «Década» y
 * «Quién responde» caían fuera de pantalla a anchos normales y «Qué se puede
 * decir» era prosa dentro de una celda — quince fichas forzadas a rejilla. El
 * coste baja a la línea de meta de su servicio, el divisor baja bajo su
 * cociente, el veredicto se dice con el texto que ya acompaña al eje, y los
 * nombres se van enteros a la ficha, que es el único sitio donde la salvedad
 * que los desarma cabe en la misma tarjeta. `min-width` baja de 1080 a 880.
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
/* El chip activo va TEÑIDO, no relleno. Iba en petróleo sólido con la tinta
   blanca encima, o sea con el mismo peso visual que un botón primario: en una
   fila de siete controles, el que estaba puesto gritaba más que el titular de
   la sección. La maqueta lo resuelve con el fondo al 8 %, el borde a plena
   carga y la tinta oscura — se distingue por el borde y el tono, no por
   invertirse. El par --civic-ink sobre --civic-soft es uno de los que
   brand-tokens.test.js ya mide en los dos temas.

   (Sin acentos invertidos aquí dentro. Van cinco veces que esta hoja se rompe
   por citar un nombre entre acentos dentro del literal: el build muere con
   «The left-hand side of an assignment expression must be a variable», que no
   se parece en nada a la causa. Los nombres van a pelo.) */
.cp-chip-on {
  background: var(--civic-soft); border-color: var(--civic);
  color: var(--civic-ink); font-weight: 600;
}

.cp-libro { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 880px; }
.cp-libro-caption {
  caption-side: top; text-align: left; padding-bottom: 8px;
  font-size: var(--fs-meta); color: var(--ink50);
}
/* Escalón micro CON su peso. §03 lo define entero —«micro · 11 · w700 ·
   ls .10em · EYEBROW / ETIQUETA»— y aquí iba a 400, que es la tinta y el peso
   más flojos del sistema para la fila que dice qué significa cada columna.
   Medido: los th daban tres tratamientos distintos entre sí (11/400/ink50,
   12/400/ink70 y 11/500/ink50), así que ordenable y no ordenable se veían
   diferentes sin que la diferencia dijera «se puede ordenar». */
/* Sin position: sticky, y no por olvido. .cp-libro-scroll lleva
   overflow-x: auto, que computa overflow-y: auto a la vez: eso convierte
   al contenedor en el bloque de scroll de la cabecera, así que la fila de
   títulos se quedaba clavada DENTRO de la caja y la primera fila de datos le
   pasaba por encima. Medido en el navegador — ninguna prueba de esta casa
   compone posiciones. El overflow está ahí por una razón medida (una tabla más
   ancha que la columna empuja el documento), de modo que entre las dos gana la
   que arregla un defecto real. */
.cp-libro thead th {
  background: var(--paper);
  text-align: left; padding: 12px 7px 9px; vertical-align: bottom;
  box-shadow: inset 0 -1px 0 var(--ink20);
  font-family: var(--font-mono); font-weight: 700;
  font-size: var(--fs-micro); text-transform: uppercase;
  letter-spacing: .1em; color: var(--ink50);
}
.cp-orden {
  font: inherit; color: inherit; background: none; border: 0;
  padding: 0; cursor: pointer; text-transform: inherit; letter-spacing: inherit;
  border-radius: var(--r-input);
}
.cp-orden:hover { color: var(--civic-ink); }
.cp-orden:focus-visible { outline: 2px solid var(--civic); outline-offset: 2px; }
/* La columna por la que se ordena AHORA se distingue de las que se podrían
   ordenar: la flecha activa en petróleo y la tinta a plena carga. */
.cp-libro thead th[aria-sort='ascending'] .cp-orden,
.cp-libro thead th[aria-sort='descending'] .cp-orden { color: var(--ink); }
.cp-orden-activa { color: var(--civic); }
.cp-orden-inerte { color: var(--ink30); }
.cp-libro td {
  padding: 13px 7px; vertical-align: middle;
  border-bottom: 1px solid var(--ink10); font-size: var(--fs-aux);
}
/* §16 · el objetivo de una fila de lista no baja de 48 px. */
.cp-libro tbody tr.cp-fila td { height: 48px; }
/* La razón sigue alineada a la derecha porque es una magnitud desnuda. El
   cociente ya NO: desde que lleva debajo entre qué divide, una cifra a la
   derecha y su glosa a la izquierda dejaban la celda partida en dos ejes. */
.cp-libro .cp-c-razon { text-align: right; }
.cp-libro th.cp-c-razon { text-align: right; }
/* El ancla de la fila. Es la cifra que contesta la pregunta de la página
   —cuánto cuesta una unidad de este servicio— y salía a 13 px peso 500, por
   debajo del nombre del servicio y al mismo peso que el resto de la fila. */
.cp-libro td.cp-c-unidad {
  font-size: var(--fs-head); font-weight: 600; color: var(--ink);
  letter-spacing: -.01em;
}

.cp-c-servicio { width: 27%; }
.cp-c-unidad { width: 22%; }
.cp-c-razon { width: 8%; }
.cp-c-posicion { width: 25%; }
.cp-c-decada { width: 18%; }
.cp-libro th.cp-c-razon, .cp-libro th.cp-c-decada { white-space: nowrap; }

/* El coste, ahora bajo el nombre de su servicio y no en columna propia. Sigue
   siendo la cifra grande de la fuente, así que se queda en mono y sin partir:
   4.262.162 EUR en DM Mono no cabe en dos líneas sin leerse como dos cifras. */
.cp-fila-coste {
  display: block; margin-top: 3px; white-space: nowrap;
  font-size: var(--fs-meta); color: var(--ink50);
}
/* Entre qué divide, debajo del cociente que divide. Es la mitad de la
   ecuación que el libro escondía: la revisión la pedía en la misma celda
   porque un cociente sin su denominador no se puede juzgar. */
.cp-fila-divisor {
  display: block; margin-top: 4px;
  font-family: var(--font-body); font-size: var(--fs-micro);
  font-weight: 400; letter-spacing: 0; color: var(--ink50); line-height: 1.35;
}
.cp-fila-divisor .cp-divisor-desde { color: var(--warn-ink); }

/* §16 · «Toda la fila es el objetivo táctil. Altura mínima 48 px.» Y: «Un
   enlace de 20 px al final de una fila de 1.100 es un objetivo hostil.» El
   objetivo era el TEXTO del nombre del servicio; ahora lo es la fila, con un
   solo enlace real dentro para que un lector de pantalla siga anunciando uno.
   El ::after se estira sobre la fila; por eso el tr va en position: relative. */
.cp-libro tbody tr.cp-fila { position: relative; }
.cp-libro .cp-c-servicio a {
  font-weight: 600; color: var(--ink); text-decoration: underline;
  text-decoration-color: var(--ink20); text-underline-offset: 3px;
}
.cp-libro .cp-c-servicio a::after { content: ''; position: absolute; inset: 0; }
.cp-libro tbody tr.cp-fila:hover { background: var(--soft); }
.cp-libro tbody tr.cp-fila:hover .cp-c-servicio a {
  text-decoration-color: var(--civic);
}
/* Paridad, la regla que §16 escribe entera: lo que aparece con el puntero
   aparece con el foco. Aquí además hace falta el anillo, porque el enlace real
   es invisible: su caja es el ::after que cubre la fila. */
.cp-libro tbody tr.cp-fila:focus-within { background: var(--soft); }
.cp-libro .cp-c-servicio a:focus-visible {
  outline: 2px solid var(--civic); outline-offset: -2px; border-radius: var(--r-input);
}
/* Lo que va ENCIMA del ::after: la otra columna con enlaces propios. Sin esto
   el nombre de quien responde deja de ser pulsable. Sólo queda en /gestion —
   el libro de servicios manda esa columna entera a la ficha— pero la regla
   vale igual para las dos hojas. Basta con posicionarla: viene después en el
   DOM, así que pinta encima sin necesitar z-index. */
.cp-libro .cp-c-responde { position: relative; }
.cp-libro .cp-c-responde a { color: var(--civic-ink); text-decoration: underline;
  text-underline-offset: 2px; }
/* La marca de atribución editorial. Objetivo generoso pese al asterisco: es
   un enlace de un carácter, que es justo lo que §16 llama objetivo hostil. */
.cp-marca-editorial {
  display: inline-block; min-width: 18px; min-height: 18px;
  margin-left: 2px; text-align: center; line-height: 1.1;
  color: var(--warn-ink); font-weight: 700; text-decoration: none;
}
.cp-marca-editorial:hover { text-decoration: underline; }
.cp-libro-leyenda {
  margin: 10px 0 0; font-size: var(--fs-micro); color: var(--ink50);
  max-width: 96ch; line-height: 1.5;
}
.cp-libro-leyenda span { color: var(--warn-ink); font-weight: 700; }

.cp-fila-meta {
  display: block; margin-top: 3px;
  font-size: var(--fs-micro); color: var(--ink50); line-height: 1.35;
}
.cp-c-posicion .cp-fila-meta { margin-top: 5px; }

/* La banda que sustituye a trece repeticiones idénticas. Va sobre la tabla,
   visible, con la misma marca ámbar que llevaba cada fila. */
/* La banda: caja teñida y tinta NORMAL, no un párrafo entero en ámbar.
   Todo el texto iba en --warn-ink y eso convertía una advertencia de dos
   líneas en un bloque que grita: el ámbar deja de señalar cuando lo ocupa
   todo. Se queda de ámbar lo que marca —el punto y el borde— y el texto vuelve
   a la tinta de lectura. Es lo que hace la maqueta y lo que ya hacía la nota de
   los extremos en la ficha de un servicio. */
.cp-libro-comun {
  display: flex; align-items: flex-start; gap: 10px;
  margin: 0 0 10px; padding: 11px 14px;
  background: var(--warn-soft); border: 1px solid var(--warn);
  border-radius: var(--r-input);
  font-size: var(--fs-aux); color: var(--ink70); line-height: 1.5;
}
.cp-libro-comun .cp-punto-warn { margin-top: 6px; }

/* Filtros · §15 pide 44 px en escritorio y 48 en móvil, y lo argumenta: «el
   filtro es la puerta a los datos; si no se puede tocar, los datos no
   existen». Estos medían 26.

   Se cumple sin engordar la pastilla. Con min-height la caja VISIBLE medía 44 y
   una fila de siete controles pesaba más que el titular de la sección; la
   maqueta los dibuja a la altura de su texto. Así que el objetivo táctil se
   estira con un ::after invisible en vez de con la caja: la pastilla mide lo
   que mide su letra y la zona pulsable sigue siendo de 44.

   El estirón es SÓLO vertical. Los chips van separados 8 px en horizontal, y un
   ::after que se saliera por los lados solaparía el objetivo del vecino — dos
   filtros que se pisan son peores que un filtro pequeño. */
.cp-libro-filtros .cp-chip { position: relative; }
.cp-libro-filtros .cp-chip::after {
  content: ''; position: absolute; left: 0; right: 0;
  top: 50%; height: 44px; transform: translateY(-50%);
}
@media (max-width: 720px) {
  .cp-libro-filtros .cp-chip::after { height: 48px; }
}

/* El grupo de orden, a la derecha de la misma fila. Con margen automático y no
   con un espaciador elástico: en un flex que envuelve, un espaciador se queda
   con todo el hueco de su línea y manda a la siguiente lo que venga detrás. */
.cp-libro-ordenar { margin-left: auto; }

/* El ámbar es SIEMPRE un hecho sobre la declaración, nunca sobre el coste. */
.cp-fila-declara {
  display: flex; align-items: center; gap: 5px; margin-top: 5px;
  font-size: var(--fs-micro); color: var(--warn-ink); line-height: 1.35;
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
  /* Sin margen automático: a lo ancho empuja el grupo de orden a la derecha,
     pero en una pantalla estrecha reservaría una fila entera para el rótulo. */
  .cp-libro-ordenar { margin-left: 0; }
  .cp-libro thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .cp-libro, .cp-libro tbody, .cp-libro tr, .cp-libro td { display: block; width: auto; }
  .cp-libro tr { border-bottom: 1px solid var(--border2); padding: 14px 0; }
  .cp-libro td { border: 0; padding: 0; }
  .cp-libro td + td { margin-top: 6px; }
  /* En tabla, 48px es un MÍNIMO: la celda crece con su contenido y la regla
     sólo garantiza el objetivo táctil de §16. En bloque es una altura DURA, y
     desde que el coste se plegó bajo el nombre la celda del servicio tiene tres
     líneas: la tercera se salía por debajo y el cociente de la celda siguiente
     le pasaba por encima. A 375px la fila entera mide 200px, así que el mínimo
     táctil lo cumple de sobra sin necesitar la altura. Medido en el navegador
     con una captura a 375; ninguna suite de esta casa compone una superposición. */
  .cp-libro tbody tr.cp-fila td { height: auto; }

  /* La serie se lee en la ficha: a 375px una raya de 88px compite con lo único
     que hace falta aquí, que es poder recorrer quince servicios. El coste ya no
     desaparece — vive en la línea de meta del servicio desde que dejó de tener
     columna propia. */
  .cp-libro .cp-c-decada { display: none; }

  .cp-libro .cp-c-servicio {
    display: flex; flex-wrap: wrap; align-items: baseline;
    justify-content: space-between; gap: 6px;
  }
  .cp-libro .cp-c-servicio .cp-fila-meta { flex-basis: 100%; margin-top: 2px; }
  .cp-libro .cp-c-servicio .cp-fila-coste { flex-basis: 100%; margin-top: 2px; }
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

/* /gestion mantiene sus seis columnas: es otra fuente y otra pregunta, y su
   columna de quién responde es la ÚNICA superficie de esos siete indicadores
   —no tienen ficha propia adonde mandarla, como sí la tienen los quince
   servicios del coste efectivo. */
.cp-libro-gestion { min-width: 900px; }
.cp-libro-gestion .cp-c-servicio { width: 23%; }
.cp-libro-gestion .cp-c-unidad { width: 11%; }
.cp-libro-gestion .cp-c-posicion { width: 22%; }
.cp-libro-gestion .cp-c-decada { width: 14%; }
.cp-libro-gestion .cp-c-decir { width: 14%; }
/* El nombre de quien responde partía en TRES líneas en las siete filas —era
   lo más ruidoso de la tabla siendo la columna menos importante— porque la
   columna medía el 11 %. */
.cp-libro-gestion .cp-c-responde { width: 16%; }
/* El cociente de /gestion NO lleva divisor debajo, así que conserva su
   alineación a la derecha: la regla base dejó de darla al perderla el libro. */
.cp-libro-gestion .cp-c-unidad, .cp-libro-gestion th.cp-c-unidad { text-align: right; }

/* Los extremos del eje 0-100. No es la frase que se repetía: dice qué escala
   es, y eso no lo dice nada más en la fila. */
.cp-eje-extremos { display: flex; justify-content: space-between; }
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
