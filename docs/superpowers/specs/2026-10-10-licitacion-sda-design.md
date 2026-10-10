# La licitación de un sistema dinámico de adquisición como registro de una subida firmada

_Diseño, 2026-10-06; decidido por el operador el 2026-10-10 a través de la sesión
coordinadora «Open session management and archival». Las cifras son las medidas el
06-10-2026 sobre main y no se actualizan._

## Por qué

La subida firmada cita contratos adjudicados o formalizados. Una licitación sin contrato se
niega: la fila diría «adjudicado» de algo que no lo está. Pero un sistema dinámico de
adquisición (SDA) no se adjudica como un contrato: es un procedimiento que queda abierto
años, y sus contratos son los derivados. Para lo que se dice de un SDA, la licitación ES el
registro.

- **El caso.** qz6weg-184 (pleno del 01-12-2025): «Los sistemas dinámicos de adquisición,
  que se aprobaron hace poco aquí, y con la cesión de la bolsa de autónomos de Riva Roja a
  otros ayuntamientos para realizar proyectos».
- **Lo que encaja.** La licitación ESDA1/2025: servicios de arquitectura e ingeniería, ofertas
  desde el 08-08-2025, «abierto a otras entidades públicas mediante el sistema de compra
  conjunta esporádica».
- **Lo que no sirve.** Sus contratos derivados son todos de 2026, posteriores al pleno: se
  parecen y no lo sostienen.
- **El ensayo.** Una subida en seco citándola pasó firma, suspensión, composición y
  transcripción, y la paró la evidencia: «es una licitación (ESDA1/2025) sin contrato
  adjudicado».

## Lo medido en `tenders.json`

- **Cuántas son.** 12 licitaciones cuyo título empieza por «Sistema dinámico de adquisición».
  Ninguna tiene contrato en su propio enlace.
- **El estado no dice nada.**
  - ESDA2/2022 está `abandoned` y tiene 45 contratos derivados.
  - ESDA1/2025 son dos filas del mismo registro de PLACSP —`deeplink:` y `deeplink%3A`, ids
    de Gobierto 4889055 y 4930957—, una `abandoned` y otra `provisionally_awarded`.
  - Sus 16 contratos derivados cuelgan de la «abandoned».
  - La tarjeta imprimiría «Desistido».
- **El importe no es gasto.** El de la licitación (3.000.000 €) es un valor estimado para toda
  la vida del SDA, hasta 2033.
- **El título no cabe.** Tiene 373 caracteres, y cortado a 240 se queda en «abierto a otras
  entidades públic…», a media cláusula: la que importa.

## Decisión: la licitación de un SDA se cita, con su clase propia

Con las mismas opciones de siempre: `--evidencia '<enlace PLACSP de la licitación del SDA>'`.

- **Cuándo se reconoce.** Su enlace no lleva a ningún contrato, y el título de la licitación
  empieza por «Sistema dinámico de adquisición», sin distinguir mayúsculas ni tildes.
  - Lo demás sin contrato sigue negándose como hoy.
  - La licitación de un contrato derivado («Contrato … derivado del SDA…») no lo es.
- **El enlace.** Se reconoce con cualquiera de sus codificaciones, y la fila guarda el del
  corpus.
- **Filas discrepantes.** Si las filas de un mismo registro no dicen lo mismo —título,
  expediente o fecha de apertura—, se niega.
- **Clase nueva.** `licitacion`, del corpus `tenders`. La tarjeta la rotula «LICITACIÓN»:
  reutilizar `tender` la rotularía «CONTRATO», de algo que no tiene contrato.

### La fila la escribe el registro

`Licitación de un sistema dinámico de adquisición · <título literal, entero> · expediente
ESDA1/2025 · ofertas desde el 08-08-2025`.

- **Nunca el estado.** En un SDA no dice nada, y la tarjeta diría «Desistido».
- **Nunca el importe.** Es un techo estimado, no dinero gastado.
- **Nunca «adjudicado».**
- **El título entero.** Como en el orden del día.
- **Los derivados no se nombran.** Cada uno se puede citar por la vía del contrato, con su
  fecha.

### Las dos reglas de la vía 2

- **La fecha.** La fecha de apertura de ofertas no puede ser posterior a la declaración.
- **El importe.** Una licitación de SDA no dice importe: con una cifra en la declaración, no
  llega a `verificado`.

## /metodologia y /aviso-legal

La evidencia puede ser también la licitación de un sistema dinámico de adquisición, que no
tiene contrato propio: sus contratos son los derivados.

- **Lo que establece.** Que el Ayuntamiento abrió ese SDA, con ese objeto y ese alcance (por
  ejemplo, abierto a otras entidades públicas), desde esa fecha.
- **Lo que no establece.** Que lo aprobara un pleno, que se esté usando, ni ninguna cifra.

## Riesgo

- **Una licitación prueba el procedimiento y su alcance declarado,** no que lo aprobara un
  pleno, que se use ni ninguna cifra.
- **qz6weg-184 (hallado el 10-10-2026, al preparar esta vía).** La lectura del 06-10 no vio que
  el pleno del 28-07-2025 (anrfd5) llevó, en su parte resolutiva, el punto 4: «Expedient
  3913/2025/GEN, Inici i aprovació de la implementació d'un Sistema Dinàmic d'Adquisició per a la
  contractació de servicis d'arquitectura i enginyeria … obert a altres entitats públiques
  mitjançant el sistema de compra conjunta esporàdica».
  - **Lo que se cita.** Su subida cita las dos cosas: ese punto (vía 2) y la licitación, abierta
    el 08-08-2025.
  - **Lo que dice el resumen.** «Se llevó al pleno», no «se aprobó»: el resultado no está en
    ningún registro.
  - **La instrucción del 09-03-2026** (1sqj7is, punto 4) es otra cosa, posterior: regula el
    procedimiento.
- **Un SDA con otro título.** Reconocer por el comienzo del título deja fuera un SDA titulado de
  otro modo, que se niega: es el lado seguro.

## Decisiones del operador (2026-10-10)

1. Clase nueva `licitacion` y etiqueta «LICITACIÓN».
2. Sólo títulos de SDA.
3. El título entero; nunca estado, techo ni «adjudicado»; la fecha y el importe, como en la
   vía 2.
