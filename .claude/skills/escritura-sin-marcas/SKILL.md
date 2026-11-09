---
name: escritura-sin-marcas
description: Úsala al escribir, reescribir o revisar un texto para lectores de fuera del proyecto — copia pública del sitio (castellano o valenciano), solicitudes a convocatorias, becas, premios o charlas, escritos a administraciones (Ayuntamiento, Generalitat, ministerios, AEPD, CTBG, Síndic de Greuges), correos a prensa o a aliados — y cuando alguien diga que un texto «suena a IA». Corrige defectos de escritura; no oculta el uso de IA. Se dispara con «redacta la solicitud», «escribe la carta al ayuntamiento», «prepara el escrito», «revisa este texto», «¿suena a máquina?», «humanízalo», «redacta en valencià», «escriu l'escrit a l'Ajuntament», «write the grant application», «grant proposal», «talk abstract», «CFP», «pitch», «motivation letter», «write the copy for the page», «rewrite this page text», «letter to the council / town hall», «transparency request», «complaint to the Síndic», «does this sound like AI?», «make it read less like ChatGPT».
---

# Escribir sin marcas de máquina

Este skill corrige los defectos de escritura que suelen acompañar al texto
generado: vaguedad, importancia inflada, fuentes vagas, absolutos sin
comprobar, cifras que caducan. **Su objetivo no es que nadie note que se usó un
modelo.** Donde el destino pide declararlo, se declara (véase _Ética_).

Calibrado el 09-11-2026 sobre la copia del sitio, borradores de solicitudes y
un escrito real a una administración. Las palabras de las listas («cabe
destacar», «crucial», _delve_) casi no aparecen aquí. Las marcas que sí
aparecen son de estructura: frases absolutas que luego resultan falsas, una
máxima al final de cada sección, «no es X, es Y» puesto por ritmo, frases que
hacen inventario de funciones y respuestas que repiten el vocabulario de la
convocatoria. El escáner apenas ve estas marcas. Las ve quien lee.

**La regla que ordena todo lo demás:** la exactitud y la posibilidad de
comprobar van por delante del estilo. **Nunca se cambia una frase cierta y con
fuente por otra más fluida.** Si al quitar una marca se pierde un matiz, una
cifra o una cita, la marca se queda. Una marca que no daña al lector se señala
y no se reescribe (aviso 4 del catálogo).

## Paso 0 — ¿Adónde va el texto y qué regla de IA tiene?

Antes de tocar una palabra, averigua el destino, su regla sobre IA y si
muestra Markdown (tabla en [`references/registros.md`](references/registros.md)
§0, y la de cada convocatoria concreta en `editorial/escritura/convocatorias-ia.md`
si existe; si no está, búscala en la convocatoria o en el fichero de notas junto al
borrador, y di qué encontraste y dónde). La regla decide en qué modo trabajas:

| La regla del destino…                                             | Modo                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prohíbe el texto escrito por IA o pide que lo escriba la persona  | **Revisar sin escribir.** Marca las marcas, pregunta por los hechos que faltan y propone cortes. Las frases las escribe la persona (Paso 2 lo detalla)                                                                                                                            |
| exige declarar el uso de IA y registrarlo (p. ej. Horizon Europe) | **Declarar, explicar y registrar.** El texto de la propuesta dice qué partes se escribieron con IA y por qué hizo falta. La instrucción y la salida sin editar de esta pasada van al registro. La motivación, la trayectoria y el juicio sobre el proyecto los escribe la persona |
| no dice nada (administraciones, la mayoría de premios)            | **Escribir o reescribir.** Quien firma responde de cada hecho. Si un formulario pregunta por IA, se contesta la verdad, y esta pasada cuenta como uso                                                                                                                             |
| es copia del sitio                                                | **Escribir, y que la revisión humana vaya después de la última pasada** (Reglamento de IA, art. 50.4). Si el texto es de los que el sitio declara escritos sólo por personas, no se toca (_Qué NO hace_)                                                                          |

Si no encuentras la regla, no lo calles: di dónde la buscaste y trabaja en el
modo «no dice nada», con la verdad como respuesta si alguien pregunta.

## Paso 1 — Lo determinista primero

Las reglas de la casa pesan más que cualquier marca. Antes de opinar sobre el
estilo:

- **Lee entero `docs/DESCRIPCION.md` §Reglas de registro y §Textos
  canónicos.** No se resumen aquí: una copia parcial de esa lista se quedaría
  vieja, como pasó con todas las copias a mano de este repo. Lo que más se
  olvida en solicitudes: Riba-roja es «el primer municipio», nunca el sujeto;
  la cifra de desiertos informativos sólo con su cita y su denominador; las
  cifras de campaña se comprueban el día del envío.
- **Lo automático se describe con el alcance que publica el sitio**, no con
  uno más ancho. La frase canónica es la pregunta de `/metodologia` sobre la
  máquina (`src/i18n.jsx`, «Un hallazgo o una promesa que afirme algo de un
  cargo concreto lleva siempre la firma de alguien del equipo…») y la
  política de `/metodologia#politica-automatizacion`, que nombra sus
  excepciones. Se dice **«cargo»**, nunca «persona»; y nunca «nada», «nunca»
  ni «nothing» sobre lo que la máquina publica: hay excepciones y están
  publicadas. La frase ancha («naming a person always needs a human
  signature») se retiró por falsa el 01-11-2026.
- el dinero, sólo con `euros` / `eurosExactos` / `eurosBreves`; si falta el
  importe, «importe no publicado», nunca «0 €»;
- un crédito presupuestario nunca está «gastado» (`review:surfaces` lo señala
  junto a una cifra);
- se escribe «cotejadas» / «acarades», nunca «contrastadas»;
- las comillas encierran citas literales o mencionan una palabra como
  palabra; nunca dan énfasis ni ironía. En un hallazgo, lo entrecomillado
  tiene que estar en la transcripción (una prueba lo vigila);
- los avisos y rótulos fijos de la casa se quedan literales (tabla de
  _Excepciones_);
- ningún recuento escrito a mano en prosa del sitio.

`check:vocabulary` **no** revisa estilo: vigila los valores de los datos de
origen. No lo cites como puerta de este skill.

## Paso 2 — El procedimiento

**Si el modo es «Revisar sin escribir»**, los pasos 1 y 4 no se hacen. No
escribes borrador ni propones frases de sustitución (tampoco las del
_Arreglo_ del catálogo). Entregas sólo la lista de marcas, las preguntas sobre
hechos y los cortes, y lo demás lo escribe la persona. **Si el borrador lo
escribió un modelo** (en esta sesión, en otra, o lo dicen las notas junto al
borrador), no se le quitan marcas: dile a la persona que la
convocatoria pide sus palabras y que quitar marcas a texto de modelo no lo
convierte en suyo.

1. **Escribe (o recibe) el borrador.** Si lo escribes tú, escribe primero el
   contenido: quién, qué, cuándo, cuánto, qué documento. Lo que sólo sabe el
   operador va en ⟦…⟧. Nunca inventes un hecho, una anécdota o un mérito para
   que el texto suene humano.
2. **Escanea.** Funciona desde cualquier carpeta:
   ```
   node "$(git rev-parse --show-toplevel)/.claude/skills/escritura-sin-marcas/scripts/escanear.mjs" <fichero> [--lang es|en|va] [--plano] [--campos]
   ```
   - `--plano` si el destino no muestra Markdown (la columna «Markdown» de
     `registros.md` §0); los `.txt` ya se tratan así.
   - `--campos` en un borrador de formulario de `editorial/`: los títulos `##`
     son nombres de campo que no se pegan. Escanea **el texto de cada campo,
     no el fichero de trabajo**: con `--campos` el informe sale campo a campo,
     con sus palabras y caracteres.
   - El escáner sólo aconseja y siempre sale con 0. Separa las **marcas**
     (fuertes y débiles), los **errores de norma** (se corrigen siempre y no
     dicen nada de autoría), los **absolutos** y **universales** por
     comprobar y los **huecos**. Mira primero los racimos. Una marca débil
     sola no significa nada.
   - El valenciano tiene reglas propias para las marcas principales, pero
     están calibradas por analogía; léelo también a mano.
3. **Lee con el catálogo.** Lo que el escáner no ve se revisa a mano con
   [`references/catalogo.md`](references/catalogo.md): pérdida de concreción
   (C1), eco del financiador (C3), citas que no dicen lo que se les atribuye
   (C4), cifras que se quedan viejas (C5), nombres de órganos o
   procedimientos inventados (C8), dos cifras cercanas sin puente (C9),
   tríadas (E7), aforismos (E8), sinónimos que van rotando (E9), inventarios
   (E10) y gerundios sin sujeto (K10).
4. **Reescribe**, empezando por el contenido:
   - cambia la importancia inflada por el hecho que la justificaría;
   - parte el gerundio de cola. Si interpreta, dale una fuente o quítalo;
   - pon la fuente concreta donde haya una atribución vaga, y la relación
     documentada donde haya una conexión vaga (K9);
   - usa «es» y «tiene»;
   - en cada absoluto, comprueba si es verdad hoy o acótalo;
   - antes de borrar una frase de relleno, pregúntate qué tenía que decirle al
     lector y escribe eso. Suprimir no es escribir: un hueco no lo ve ninguna
     prueba.
5. **Léelo en voz alta**, o imagina que lo lee la persona que firma. Cambia
   cualquier frase que esa persona no diría en una conversación o en una
   ventanilla, salvo los avisos de la tabla de _Excepciones_ y los términos
   legales: nadie los dice en una ventanilla, y se quedan. Si el texto es de
   la persona y escribe en una segunda lengua, no lo dejes «perfecto»: un
   inglés sencillo y suyo es mejor que uno pulido y ajeno. Esto protege un
   texto que ya es de la persona. Nunca se añaden errores, torpezas, giros de
   segunda lengua ni «imperfecciones» a un texto de modelo para que parezca
   suyo: eso es fingir autoría.
6. **Recomprueba los hechos contra el original**, frase por frase. Mira que
   cada cifra, fecha, nombre, cita entre comillas, artículo de ley y enlace
   sigan exactamente igual y digan lo mismo. Las tres cifras de un porcentaje
   (numerador, denominador y resultado) tienen que seguir cuadrando. Ninguna
   afirmación puede haberse vuelto más fuerte que su fuente. Si algo ha
   cambiado, vuelve al original. Quitar una cifra entera no es cambiarla: si
   dos cifras ciertas chocan en el mismo texto (C9), se puede dejar sólo la
   que la frase necesita, con el visto bueno del operador. Después **vuelve a
   contar cada campo** contra el límite del destino (está en el fichero de
   notas junto al borrador): cada acotación que añade palabras necesita un
   corte que las compense. Este paso no se salta: es el único que protege lo
   que de verdad importa.

**Informa de los cambios, no los apliques en silencio.** En un borrador de
`editorial/`, enseña cada cambio con su motivo y la entrada del catálogo, para
que el operador pueda rechazarlo. La prosa ya publicada no se cambia así:
sigue la revisión normal y, si cambia el sentido, pasa por el registro de
correcciones. Nada automático reescribe prosa publicada.

## Registros

Los tres registros se explican con detalle en
[`references/registros.md`](references/registros.md).

**a) Copia del sitio (castellano y valenciano).** El modelo de la casa es el
registro de correcciones de un reportaje: lleva fecha, dice qué estaba mal,
qué cambió y qué no cambió, y no usa adjetivos. Al sitio se le habla de «tú».
Los datos (actas, nombres oficiales, citas) se quedan literales y en su
idioma. Un lema canónico se cambia primero en `docs/DESCRIPCION.md` y desde ahí
se propaga; no se parafrasea en una sola superficie. En valenciano, usa la
serie de demostrativos que ya use la superficie.

**b) Solicitudes a convocatorias, becas, premios y charlas.** Primero la regla
de IA (Paso 0). Después:

- convence lo concreto y comprobable: piezas enlazadas, qué se encontró y
  cómo, fechas;
- las cifras se vuelven a contar el día del envío;
- lo que hace la IA en el proyecto se describe con el alcance de la frase
  canónica de `/metodologia` (Paso 1), «cargo» y no «persona», y con sus
  excepciones;
- cada campo, dentro de su límite de palabras o caracteres;
- en campos de texto plano, sin Markdown;
- en inglés, coma, dos puntos o paréntesis cuando lean más claro que la raya;
- el material vive en `editorial/`, no se sube al repositorio y no va en
  ninguna PR.

**c) Escritos a administraciones.** Sigue la Ley 39/2015, art. 66.1: hechos,
razones y petición con toda claridad, órgano y código DIR3, medio de
notificación, lugar, fecha y firma. Además:

- EXPONE y SOLICITA, con una petición numerada por cada documento exacto;
- base legal con ley, artículo y apartado, comprobada en el BOE o el DOGV;
- el nombre del órgano, del registro y del procedimiento, copiado de la sede
  o del DIR3 (C8);
- los plazos se cuentan de fecha a fecha y desde la recepción;
- sin cortesía de plantilla, sin fórmulas arcaicas y sin párrafo final que
  repita la petición;
- el saludo lleva dos puntos, no coma;
- **un fichero limpio por destinatario**: contiene sólo el texto que se
  presenta.

## Excepciones de la casa (parecen marcas y no lo son)

| Rasgo                                                     | Regla                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raya «—» en castellano                                    | Es puntuación correcta. La raya de coda espaciada se señala sólo en texto nuevo: los lemas canónicos la llevan («…y cuánto cuesta — con una fuente para cada cifra») y se citan así, y la copia publicada no se reescribe para quitarla                                                                                                                                                                                                                                                                       |
| Comillas angulares «»                                     | No se cambian por "…". Nunca se usan para dar énfasis                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| «sólo», «ésa», «éste» con tilde                           | Es elección de la casa; no se «corrige»                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Negrita al empezar una entrada                            | Es el formato de la casa en documentos y correcciones. En un formulario de texto plano, se quita                                                                                                                                                                                                                                                                                                                                                                                                              |
| «No es X: es Y» o «X, not Y» que corrige una mala lectura | Se queda siempre que corrige una mala lectura concreta de una cifra o un estado, aunque haya varios en el texto (un cero no es un «no consta»). El que sólo da ritmo se corta, y de ésos queda uno por texto como mucho                                                                                                                                                                                                                                                                                       |
| Lemas canónicos de `docs/DESCRIPCION.md`                  | Se citan literales, con su puntuación. El escáner los lee de allí y no los escanea                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Tríada o «ni… ni… ni…» que agota la lista de verdad       | Se queda. La tríada rellenada para que suene bien, no                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Frase larga con la advertencia dentro                     | Se queda: la advertencia va junto a su cifra. No se trocea por «ritmo»                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Límite declarado («dónde se acaban los datos oficiales»)  | Se queda: nombra el hueco y su causa. La cautela vaga del chat (K6), no                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Avisos y rótulos fijos de la casa                         | «importe no publicado», «sin IVA», «Redacción automática», «publicada automáticamente · revisión pendiente», «propuesta automática · pendiente de revisión humana», «Borrador editorial», «debatido, sin voto transcrito», «Literal retenido», «es un precio y no un rendimiento», la cuota de cobertura de una capa: se quedan literales y junto a su cifra, aunque suenen a formulario o se repitan. Ninguna pasada de estilo los acorta, los mueve, los funde con otra frase ni los cambia por un sinónimo |
| Declaración de uso de IA y registro de procedencia        | No se escanean como estilo ni se acortan. Sólo se tocan para completarlas o hacerlas más exactas; nunca para que ocupen menos o se noten menos. En un borrador, enciérralas entre `<!-- declaracion-ia -->` y `<!-- /declaracion-ia -->` y el escáner las salta                                                                                                                                                                                                                                               |
| Vocabulario de la propia convocatoria                     | Repetir su categoría o su criterio para mostrar que encaja («A breakthrough-stage project», la sección «beyond the state of the art») no es marca. Repetirlo como relleno, sí (C3)                                                                                                                                                                                                                                                                                                                            |
| Frase canónica repetida en varias superficies             | Se queda: se deriva a propósito de `docs/DESCRIPCION.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| La fuente de cada cifra, dicha en el texto                | En el sitio y en los escritos es regla, no marca (K5)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| «Al amparo de…», «EXPONE», «SOLICITO», «PRIMERO.—»        | Es el género del escrito administrativo                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ⟦…⟧ en un borrador                                        | Es la convención correcta. Se rellena antes de enviar                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Una palabra de la lista dentro de una cita de una fuente  | Es una prueba, no una marca                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Ética

- **Este skill mejora la escritura. No oculta el uso de IA.** Si un
  financiador, un premio, un congreso, una publicación o una administración
  exige declarar el uso de IA, la declaración se hace y se queda. El skill
  nunca la quita, la suaviza ni la escribe de forma que no se vea.
- **Sólo para los tres registros.** No se usa en trabajos académicos
  evaluados, en concursos o convocatorias que exigen autoría propia, ni en
  reseñas, testimonios, Wikipedia o Wikidata.
- **Si un destino prohíbe el texto escrito por IA o pide las palabras de la
  persona**, el skill sólo revisa. La persona escribe con sus
  palabras, y la motivación y la experiencia no las genera nunca un modelo.
  Tampoco se escribe un «borrador de referencia» de la motivación para que la
  persona lo lea: parafrasear un modelo no es escribir con sus palabras.
- **Si un destino exige registrar el uso** (un registro de procedencia
  con instrucciones y salida sin editar), esta pasada también se registra: su instrucción y su salida sin
  editar. Un reenvío declara todo lo que declaró el original **más** el uso de
  IA posterior, esta pasada incluida; nunca menos.
- **Texto que firmará otra persona** (carta del proponente de un premio,
  carta de apoyo, aval): el skill prepara los hechos con sus fuentes, no
  escribe con la voz de esa persona. Si se le da un borrador, sabe que lo
  redactó un modelo, y la regla del destino se le aplica a ella.
- **Esta pasada no cambia la firma ni el rótulo de un texto.** Deja como
  están `curatorName`, `editor`, la firma de una corrección o de una rebaja, y
  «Redacción automática», «publicada automáticamente · revisión pendiente»,
  «propuesta automática · pendiente de revisión humana» y «rebajado en una
  revisión automática». Si un curador firma después una prosa que escribió o
  reescribió un modelo (también este skill), su firma certifica una revisión,
  no una redacción. Díselo al operador antes de que firme, porque
  `src/scraper/finding-authorship.ts` contará esa ficha como escrita por una
  persona en `/metodologia`.
- **Nunca se usa para engañar a un detector.** El escáner no es un detector.
  Nunca se ajustan la longitud de las frases, la puntuación ni el vocabulario
  para cambiar cómo puntuaría uno. Ninguna salida de este skill dice
  «indetectable», «pasa los detectores», «suena 100 % humano», «ya no suena a
  IA», «now reads as human-written» ni nada que certifique autoría. A un
  «¿suena a IA?» se contesta con los defectos de escritura, no con un
  veredicto de autoría. Un recuento bajo no prueba que lo escribiera una
  persona.
- **En la copia del sitio**, la revisión humana con responsabilidad editorial
  va después de la última pasada de IA. Los avisos de texto generado por
  máquina que publica el sitio no se quitan ni se rodean. `/metodologia` y
  `/aviso-legal` declaran lo que publican los procesos automáticos, **no** que
  reportajes, fichas o textos de página se redacten con un modelo: si este
  skill redacta o altera sustancialmente uno de ésos, díselo al operador, que
  decide si se declara.
- **No se escribe texto para Wikipedia** sobre el proyecto ni sobre el
  municipio: allí el texto escrito por modelos está prohibido, aunque se haya
  reestilizado.

## Qué NO hace

- **No toca los textos que el sitio declara escritos sólo por personas.** No
  los redacta, no los reescribe, no propone frases para ellos y no los pasa
  por el escáner con ese fin. Son la opinión del editor de `/eficiencia`
  (`/metodologia#opinion-editor`, `src/scraper/opinion-editor.ts`), la
  enmienda del motivo de un hallazgo que nombra a un grupo de un solo
  concejal y el vocabulario de asuntos de `/cargos`. Su validador sólo
  rechaza campos de procedencia, y una reescritura de un modelo no deja
  ninguno: esta regla sólo la cumple quien usa el skill. Si te lo piden,
  explica por qué no.
- No comprueba que una cita diga lo que la frase afirma. Para eso están
  `revisar-borrador` y `check:citations`.
- No juzga si una página dice algo verdadero junto a sus datos. Para eso está
  `revisar-superficies` (que trae también el procedimiento para dos cifras
  ciertas que el lector no puede conciliar).
- No es una puerta. No bloquea commits ni envíos, y no debe convertirse en una:
  una heurística de estilo que bloquea genera falsos positivos sin parar (lo
  explica la cabecera de `src/scraper/magnitudes-fiscales.ts`).
- No decide el tono de una pieza ni si es interesante.

## El detalle

- [`references/catalogo.md`](references/catalogo.md): cada marca con lo que hay
  que buscar, ejemplos en castellano, inglés y ruso, el arreglo, la fiabilidad
  y la excepción de la casa, con las fuentes y la fecha en que se leyeron.
  Léelo cuando el escáner señale un id que no entiendas o cuando revises a
  mano.
- [`references/registros.md`](references/registros.md): las reglas de IA y el
  formato de cada destino, la estructura de un escrito según la LPACAP y lo
  que un evaluador penaliza. Léelo en el Paso 0.
