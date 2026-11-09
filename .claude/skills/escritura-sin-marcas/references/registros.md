# Los tres registros

Léelo cuando sepas adónde va el texto. Fuentes leídas el 09-11-2026; lo que
está marcado **(verifica)** se dio de memoria o por fuente secundaria y hay que
comprobarlo en el texto vigente antes de apoyarse en ello.

## 0. Primero: ¿adónde va, qué regla de IA tiene y si muestra Markdown?

La columna **Markdown** decide si se escanea con `--plano`: «no» quiere decir
que `**`, `##` y `[texto](url)` llegan al lector como signos sueltos. Lo
marcado **(verifica)** no se ha comprobado en el formulario mismo.

La tabla de abajo trae sólo reglas **generales** (marcos legales y de financiación públicos). La regla de cada convocatoria concreta a la que se presenta el proyecto vive **fuera del repositorio**, en `editorial/escritura/convocatorias-ia.md` (gitignorado): léela si existe, y si el destino no está ahí tampoco, busca su regla como dice el párrafo siguiente a la tabla.

| Destino                                 | Regla sobre IA (parafraseada)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Modo del skill                                                                                                                                                                                                                                                                                                                                                                                                                   | Markdown                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Horizon Europe / Comisión Europea**   | El solicitante responde de todo lo producido con IA; transparencia sobre herramientas, lista de fuentes, control de plagio; recuadro de orientación en las plantillas desde 2023 **(verifica en la plantilla de la convocatoria)**                                                                                                                                                                                                                                                                      | Declarar en el recuadro; lista de herramientas y fuentes; cada cita comprobada                                                                                                                                                                                                                                                                                                                                                   | plantilla Word o PDF: da formato, no Markdown |
| **NIH** (EE. UU.; sólo referencia)      | Una solicitud «sustancialmente desarrollada por IA» no se considera original (NOT-OD-25-132)                                                                                                                                                                                                                                                                                                                                                                                                            | Indica hacia dónde van los evaluadores                                                                                                                                                                                                                                                                                                                                                                                           | —                                             |
| **Wikipedia** (en, de)                  | Prohibido el texto de artículo escrito por modelos (en: marzo de 2026; de: febrero de 2026)                                                                                                                                                                                                                                                                                                                                                                                                             | No se usa este skill para escribir texto de Wikipedia, ni sobre el proyecto ni sobre el municipio                                                                                                                                                                                                                                                                                                                                | —                                             |
| **Administraciones españolas** (LPACAP) | No se encontró ninguna norma que obligue a un ciudadano a declarar ayuda de IA en un escrito                                                                                                                                                                                                                                                                                                                                                                                                            | No inventes una. Quien firma responde de cada hecho, fecha y cita legal. Si un formulario concreto pregunta por IA, se responde con la verdad                                                                                                                                                                                                                                                                                    | no (sede electrónica, correo, PDF)            |
| **Copia del sitio**                     | Reglamento europeo de IA, art. 50.4, aplicable desde el 02-08-2026: quien despliega IA declara el texto generado o manipulado que se publica para informar al público sobre asuntos de interés público, salvo revisión humana real con responsabilidad editorial de una persona física o jurídica. Según el resumen de DLA Piper de las directrices de la Comisión (julio de 2026), una corrección ortográfica no basta, y la excepción se pierde si la IA reformula después de la firma **(verifica)** | La revisión editorial va **después** de la última pasada de IA. El skill no quita avisos de texto generado ni hace una pasada de estilo tras la firma sin nueva revisión. Si el proyecto es «responsable del despliegue» lo decide el operador; la lectura prudente es que sí. La excepción por revisión humana es un mínimo legal, no un motivo para quitar marcas a un texto que el sitio rotularía si lo publicara un proceso | sí (JSX, JSON)                                |
| **Ética periodística**                  | El código propuesto por el Colegio de Periodistas de Andalucía (marzo de 2026) pide verificar por una persona y avisar al receptor del material generado o alterado sustancialmente por algoritmos                                                                                                                                                                                                                                                                                                      | `/metodologia` y `/aviso-legal` declaran lo que publican los procesos automáticos (hallazgos con «Redacción automática», promesas auto-publicadas, rebajas automáticas). **No** declaran que reportajes, fichas o textos de página se redacten con un modelo. Si este skill o una sesión redacta o altera sustancialmente uno de ésos, díselo al operador: decide él si se declara. El skill no da la declaración por hecha      | —                                             |

Si el destino no está en esta tabla, busca su regla (la convocatoria, sus
preguntas frecuentes, el fichero de notas junto al borrador en `editorial/`)
y di cuál es, o dónde la buscaste sin encontrarla, **antes** de tocar una
palabra. Sin regla encontrada, el modo es «escribir o reescribir» y la
respuesta, si alguien pregunta, la verdad.

---

## a) Copia pública del sitio (castellano, valenciano)

**Manda el proyecto, no el estilo.** Antes que cualquier marca del catálogo:

- `docs/DESCRIPCION.md` §Reglas de registro y §Textos canónicos, **enteros**:
  no se copian aquí para que no deriven. Entre otras: no imputar intención;
  Riba-roja es «el primer municipio», nunca el sujeto; nunca «auditoría»;
  nunca «puntuamos»; los desiertos informativos sólo con su cita.
- `CLAUDE.md`: el dinero sólo con `euros`, `eurosExactos`, `eurosBreves`;
  «importe no publicado», nunca «0 €»; nunca «gastado» para un crédito;
  ningún recuento escrito a mano en prosa; los datos (titulares, títulos de
  actas, nombres oficiales, citas de promesas, citas legales) se quedan en su
  idioma y literales.
- **Lo automático, con el alcance publicado.** «Cargo», no «persona»; la
  frase canónica es la de la pregunta sobre la máquina de `/metodologia`
  (`src/i18n.jsx`, «Un hallazgo o una promesa que afirme algo de un cargo
  concreto…») y la política de `/metodologia#politica-automatizacion`, con sus
  excepciones nombradas. Nunca «nada» ni «nunca» sobre lo que publica la
  máquina.
- «Cotejadas» / «acarades», nunca «contrastadas»; una prueba lo vigila.
- Las comillas encierran citas literales o mencionan una palabra como
  palabra; nunca dan énfasis ni ironía.
- **Textos que el sitio declara escritos sólo por personas**: la opinión del
  editor de `/eficiencia` (`/metodologia#opinion-editor`), la enmienda del
  motivo de un hallazgo que nombra a un grupo de un solo concejal y el
  vocabulario de asuntos de `/cargos`. Este skill no los redacta, no los
  reescribe y no propone frases para ellos.
- Los avisos y rótulos fijos (la tabla de _Excepciones_ de `SKILL.md`) se
  quedan literales y junto a su cifra.

**El modelo de prosa de la casa** es el registro de correcciones de un
reportaje (`public/data/reportajes/*.json`, campo de correcciones): fechado,
dice qué estaba mal, qué cambió y qué no cambia. Sin adjetivos.

**La prosa publicada no se reestiliza libremente.** Una pasada de estilo sobre
un reportaje o una ficha publicados es un cambio de prosa publicada: va por la
revisión normal y, si cambia el sentido, por el registro de correcciones
(regla 4 de integridad de datos). Tocar una cadena de `src/i18n.jsx` también
mueve el mapa de prosa. Los lemas canónicos de `docs/DESCRIPCION.md` se
cambian allí primero y se propagan; parafrasear una superficie crea deriva.

**Valenciano.** Sigue la serie de demostrativos que ya use la superficie
(«este / eixe»); no mezcles con «aquest». Las mismas reglas de comillas,
mayúsculas y raya que en castellano. Comprueba los castellanismos de V5 en la
AVL o el DNV.

**Qué cortar en copia nueva:** cierres aforísticos de más (E8), «no es X, es Y»
que sólo da ritmo (K1), tríadas de relleno (E7), rayas inglesas en coda (F5),
resúmenes que repiten (E3), inventarios (E10).

---

## b) Solicitudes a convocatorias, premios, becas y charlas

**Dónde vive.** En `editorial/` (ignorado por git). El material de financiación
nunca se sube ni va a una PR.

**Lo que el evaluador penaliza como mala escritura.** Los lectores expertos
que usan modelos a menudo reconocen muy bien el texto generado (Russell et
al., 2025); los no expertos, apenas mejor que el azar. Y la gente ya escribe y
habla también con estas palabras (Yakura et al.), así que una marca no prueba
nada. Lo que sí se penaliza:

- superlativos genéricos (_innovative, cutting-edge, robust, seamless,
  leverage, empower, foster_), salvo que sean el criterio de la propia
  convocatoria;
- la apertura _In today's rapidly evolving landscape_;
- bloques de viñetas perfectamente paralelos y una síntesis tras cada sección;
- afirmaciones sin números ni trabajo previo con nombre;
- la respuesta que repite el vocabulario de la pregunta como relleno (C3);
- un inglés que no es el del solicitante: si un modelo lo escribió, se
  declara donde se pida; no se disfraza.

**Lo que funciona** es lo concreto y comprobable: enlaces a piezas, qué se
encontró y cómo, cuántas correcciones constan, fechas. Los pasajes medidos y
específicos de los borradores existentes son mejor modelo que cualquier
plantilla. Si el texto es del solicitante, un inglés sencillo y suyo es mejor
que uno pulido y ajeno; eso no autoriza a ensuciar un texto de modelo para que
lo parezca.

**Reglas de la casa para solicitudes:**

- Las cifras se vuelven a contar **el día del envío**, de su `stats` o de su
  fuente; numerador, denominador y porcentaje se dividen y cuadran.
- Las frases absolutas y universales («nunca», «nadie», «nothing», «none»,
  «every») se comprueban contra el sitio de hoy (C2). Las que describen lo
  que hace la IA en el proyecto, dos veces, y con el alcance de la frase
  canónica de `/metodologia`: «cargo concreto», con sus excepciones; nunca
  «person» ni «nothing … without a human signature».
- Cada campo tiene un límite de palabras o caracteres; está en el fichero de
  notas junto al borrador. Que el formulario no lo controle no lo quita: a
  veces va sólo en el texto de ayuda y el campo acepta más. Escanea con `--campos` y vuelve a contar después de
  cada cambio: acotar una afirmación añade palabras, y hay que cortarlas en
  otra parte.
- Dos cifras cercanas de universos distintos en el mismo formulario (el
  denominador del estudio de desiertos informativos y el censo vigente de
  municipios, ambos en `docs/DESCRIPCION.md`) se leen como un error:
  nombra la diferencia o deja sólo la que la frase necesita (C9).
- Lo que sólo sabe el operador (motivación, trayectoria, datos personales) va
  en ⟦…⟧ y lo escribe él.
- En un campo de texto plano, sin Markdown (F8).
- En inglés, coma, dos puntos o paréntesis cuando lean más claro que la raya;
  la raya no se cambia sólo por ser raya.

**En castellano** (convocatorias españolas): «solicitar» o «presentarse a»,
nunca «aplicar a»; nada de «poner en valor». «De cara a» lo admite el DPD:
cámbialo sólo si «para» queda más llano.

---

## c) Escritos y solicitudes a administraciones públicas

**Lo que exige la ley.** Ley 39/2015 (LPACAP), art. 66.1: nombre y apellidos
del interesado y, en su caso, de quien lo represente; medio electrónico o lugar
físico para notificar; **hechos, razones y petición, con toda claridad**; lugar
y fecha; firma o acreditación de la voluntad; órgano al que se dirige con su
código de identificación (el código DIR3). Art. 13 y 15: se puede escribir en
la lengua cooficial, así que a la Generalitat o al Ajuntament se les puede
escribir en valenciano. Art. 14.2: las personas jurídicas (la asociación, una
vez constituida) están **obligadas** a relacionarse por vía electrónica. Art.
16.4: dónde presentar (registro electrónico del destinatario, Correos,
oficinas de asistencia en materia de registros).

**La ley que toca.** El acceso a información pública se rige por la Ley
19/2013 y, en la Comunitat Valenciana, por la Ley 1/2022 de Transparencia y
Buen Gobierno; la LPACAP es el procedimiento. Una reclamación por acceso a una
entidad local valenciana va al órgano autonómico de transparencia, no al CTBG
**(verifica para cada caso)**. Confirma artículo y apartado en el BOE o el
DOGV consolidado; un número de artículo inventado es el error de máquina más
caro en este registro, junto con el nombre inventado de un órgano, un
registro o un procedimiento (C8): cópialo de la sede electrónica o del DIR3.

**Plazos.** Por meses, de fecha a fecha (art. 30.4), y desde la **recepción**
por el órgano competente, no desde el envío. La ampliación de plazo de la Ley
19/2013 es una como mucho.

**Estructura.**

```
Al ⟦órgano⟧ (DIR3 ⟦código⟧)

⟦Nombre⟧, con ⟦documento⟧ y domicilio a efectos de notificaciones en ⟦medio⟧,

EXPONE
PRIMERO.— ⟦hecho fechado, con su documento: expediente, fecha, CSV, punto del orden del día⟧.
SEGUNDO.— ⟦…⟧.

Al amparo de ⟦ley, artículo y apartado⟧,

SOLICITA
a) Copia de ⟦documento exacto⟧.
b) ⟦…⟧, en formato reutilizable.

⟦Lugar⟧, a ⟦fecha⟧.
⟦Firma⟧
```

«PRIMERO.—» con punto y raya es tipografía jurídica correcta, no una marca.

**Lo que lo hace sonar a formulario o a máquina:** la cortesía de plantilla (T2); un
párrafo inicial sobre la importancia de la transparencia; una petición vaga
(«información sobre los contratos») en vez de una lista con el documento
exacto; un párrafo final que repite la petición; Markdown; el saludo con coma
(F4); las fórmulas arcaicas (T3). Los errores de fondo son peores que los de
estilo: la ley equivocada, el artículo inventado, el plazo mal contado.

**Lo que lo hace sonar a persona cuidadosa** (Guía de lenguaje claro de la
GVA, julio de 2023): una petición numerada por documento; base legal exacta;
el formato y el canal que se piden; frases de menos de unas treinta palabras;
sin cadenas de subordinadas; verbos conjugados en vez de nominalizaciones
(«evaluaremos», no «se realizará una evaluación»); palabras llanas
(«carecer», no «adolecer»; «problema», no «problemática»); sin gerundios
ambiguos ni sin sujeto (K10); negrita, no mayúsculas, para destacar.

**Un fichero limpio por destinatario.** El escrito que se presenta es un
fichero que contiene **sólo** el texto que se presenta. Las instrucciones («dónde
y cómo», «tráeme el número») van en otro fichero: el operador adjunta el
fichero entero.

**El mismo registro sirve para** la AEPD, el Consejo de Transparencia, el
Síndic de Greuges y los ministerios, cada uno con su ley y su sede. Un correo a
una persona de la administración (no un escrito de registro) va al hecho y
termina cuando termina la petición.

---

## Fuentes de este fichero (leídas el 09-11-2026)

- Ley 39/2015, texto consolidado del BOE (arts. 13, 15 y 16 leídos; 14.2, 30.4
  y 66.1 por conocimiento, a contrastar con el texto vigente).
- Generalitat Valenciana, _Guía de lenguaje claro_, julio de 2023.
- RVO (agencia neerlandesa) y EMDESK sobre IA en propuestas de Horizon Europe.
- NIH NOT-OD-25-132.
- DLA Piper, resumen de las directrices de la Comisión sobre transparencia de
  la IA, 10-08-2026; Comisión Europea, código de buenas prácticas sobre
  contenido generado por IA.
- Colegio de Periodistas de Andalucía, propuesta de código deontológico,
  marzo de 2026.
