# Catálogo de marcas de texto generado

Fusión de cuatro fuentes, leídas el 09-11-2026 (lista completa al final):
el ensayo de la Wikipedia en ruso «Признаки сгенерированности текста»
(ВП:ПРГЕН), la guía de la Wikipedia en inglés «Signs of AI writing»
(WP:AISIGNS), la investigación publicada hasta esa fecha, y las marcas propias
del castellano y del valenciano. Cada entrada lleva el id que imprime
`.claude/skills/escritura-sin-marcas/scripts/escanear.mjs`; las que no tienen regla en el escáner se leen a mano y
lo dicen («sólo a mano»).

**Cómo leer una entrada.** _Busca_: qué mirar. _Ej._: ejemplos inventados para
este catálogo, en castellano (es), inglés (en) y, cuando la entrada viene del
ensayo ruso, su término [ru]. _Arreglo_: qué hacer. _Fiabilidad_: **fuerte**
(casi nunca sale en prosa humana del registro; sólo T1, E4 y F7), **débil**
(sólo cuenta en racimo: tres o más en un párrafo), **norma** (error contra la
norma o contra el destino: se corrige siempre y no dice nada de quién escribió
el texto; el escáner no lo cuenta en la densidad ni en los racimos) o **no
fiable** (no la uses para juzgar). _Casa_: la excepción de estilo de
CivicPulse, si la hay.

**Cuatro avisos que valen para todo el catálogo.**

1. **Una marca es un síntoma, no el defecto.** Las dos wikipedias lo dicen: el
   daño está en la afirmación sin fuente, la importancia inflada y la conexión
   inventada. Quitar las marcas y dejar eso sólo hace el texto más difícil de
   revisar. Primero el contenido (grupo C), después el estilo.
2. **Racimos, no palabras sueltas.** Un «crucial» no dice nada. Cinco marcas en
   un párrafo sí. Todas las fuentes serias pesan por densidad.
3. **Las marcas cambian con cada modelo.** Cuando se entrenó a los modelos para
   no usar la raya, la prosa de sólo comas y puntos pasó a ser marca (E6). Una
   lista prohibida sin el porqué caduca en meses: por eso cada entrada dice por
   qué existe.
4. **Una marca sin daño para el lector se señala y no se reescribe.** Si el
   único motivo de una entrada es que la usan los modelos (K2, V6, E6 y F5 en
   inglés), sólo se cambia cuando además daña al lector: una frase vaga, un
   inciso que confunde o un ritmo que esconde un matiz. Nunca se ajustan la
   longitud de las frases, la puntuación ni el vocabulario para cambiar cómo
   puntuaría un detector.

---

## 1. Vocabulario

### V1 · Importancia inflada

- **Busca:** el texto argumenta que algo importa en vez de decir qué hace.
  «juega un papel crucial / fundamental / clave», «es un testimonio de», «deja
  una huella imborrable», «marca un hito», «un antes y un después», «subraya la
  importancia de». Variante: admite que algo es menor y aun así le atribuye
  sentido («aunque poco conocido, simboliza…»).
- **Ej.:** es «El portal juega un papel clave en la vida democrática del
  municipio» · en "The archive stands as a testament to civic memory" · ru
  [чрезмерный акцент на символизме и важности; «играет ключевую роль»,
  «неизгладимый след»].
- **Por qué:** el modelo elige la formulación media; si diez fuentes elogian y
  dos dan un dato raro, se queda con el elogio y pierde el dato (ВП:СНИИ).
- **Arreglo:** el hecho que justificaría el adjetivo. «Juega un papel clave» →
  «publica las actas de pleno desde ⟦año⟧, con enlace a cada una». Si la frase
  lleva una cifra, se lee de su `stats` el día que se escribe.
- **Fiabilidad:** débil sola; fuerte en racimo.

### V2 · Vocabulario hinchado o calcado

- **Busca:** es «sumergirse en», «adentrarse en», «desentrañar», «navegar las
  complejidades», «empoderar», «poner en valor», «sinergia», «holístico»,
  «tapiz de», «faro de», «piedra angular», «ecosistema de», «en el corazón de»,
  «sin precedentes». en _delve, tapestry, intricate, meticulous, showcase,
  pivotal, multifaceted, seamless, leverage, harness, synergy, holistic, realm,
  transformative, groundbreaking, cutting-edge, world-class, north star, deep
  dive, key takeaways_.
- **Por qué:** son palabras de estilo, no de contenido; su exceso en millones
  de resúmenes de PubMed permitió estimar el uso de modelos (Kobak et al.,
  2025). Juzek y Ward (2025) no encuentran que vengan de la arquitectura ni de
  los datos; el ajuste con preferencias humanas contribuye, pero poco. Lo
  seguro es que cambian con cada versión del modelo. WP:AISIGNS fecha las
  oleadas:
  _delve, tapestry, testament, vibrant_ (2023–24); _align with, enhance,
  fostering, showcasing_ (2024–25); _leverage, multifaceted, prioritize,
  challenge_ (desde mediados de 2026).
- **Arreglo:** la palabra llana o el dato. «Ecosistema de datos abiertos» →
  «los portales de datos de la Generalitat y del ministerio».
- **Fiabilidad:** débil sola; fuerte en racimo. En castellano no hay estudio
  que valide la lista: está calibrada por analogía con el inglés.
- **Casa:** una palabra de la lista **dentro de una cita** de una fuente es
  prueba, no marca (el «sin precedentes» de un proveedor citado en un
  reportaje). El escáner salta lo entrecomillado por eso. Tampoco es marca el
  término que la convocatoria exige como sección o criterio (Horizon Europe
  pide «beyond the state of the art»; muchas preguntan por _innovation_):
  usarlo como encabezado o para responder al criterio es encaje; repetirlo
  como relleno es C3. Por eso el escáner ya no lista _state-of-the-art_.

### V3 · Tono promocional

- **Busca:** es «vibrante», «enclavado», «rico patrimonio», «de vanguardia»,
  «innovador», «de primer nivel». en _vibrant, nestled, rich heritage,
  breathtaking, renowned, innovative, robust, empower_.
- **Ej.:** en "a vibrant town nestled in the heart of the Camp de Túria" · ru
  [рекламный и перегруженный позитивизмами язык; «расположенный в самом
  сердце»].
- **Arreglo:** quítalo o pon el hecho que lo sostendría.
- **Fiabilidad:** débil. WP lo da por menguante desde 2024 salvo que se pida;
  **en una solicitud de financiación se pide implícitamente**, así que ahí
  vigílalo más.
- **Casa:** el criterio de la propia convocatoria (_innovative_ cuando la
  pregunta es «¿qué tiene de innovador?») no es marca; véase V2.

### V4 · Rodeo de «es» / «tiene»

- **Busca:** es «sirve como», «se erige como», «se posiciona como»,
  «constituye un reflejo de». en _serves as, stands as, boasts, features,
  functions as_.
- **Arreglo:** «es», «tiene». WP:AISIGNS lo cuenta entre las marcas
  persistentes; escribir «es» y «tiene» es también señal de prosa humana.
- **Fiabilidad:** débil.

### V5 · Calcos y falsos amigos (es) y castellanismos (va)

- **Busca (es), lo que la norma desaconseja:** «aplicar a una beca /
  convocatoria» (→ «solicitar», «presentarse a»), «eventualmente» por
  _finally_ (→ «finalmente»), «asumir que» por _assume_ (→ «suponer»), «en
  base a» (el DPD recomienda «según», «a partir de»), «a nivel de» cuando no
  hay niveles, «impactar en» por «afectar» **(verifica en Fundéu)**.
- **Preferencia de estilo, no error (es):** «de cara a» (el DPD la admite con
  el sentido de 'con vistas a, en relación con'), «enfatizar» y «remarcable»
  (están en el DLE), «a nivel municipal / autonómico / estatal» cuando se
  habla de niveles administrativos reales, que en un monitor municipal es lo
  normal. El escáner las lista como «estilo» y no las cuenta: cámbialas sólo
  si la forma llana se lee mejor. Comprobado de memoria contra el DPD (2005) y
  el DLE el 09-11-2026; **confírmalo en la fuente** antes de mover una forma
  de grupo.
- **Busca (va):** «en base a», «degut a» (→ «a causa de»), «donat que» (→
  «atés que»), «tindre que» en prosa formal (→ «haver de»), «a nivell de»,
  «jugar un paper» (→ «fer un paper»), «lo» neutre («lo important» → «el que és
  important»), «doncs» con valor causal. Un estudio de Àccent Obert con la UPF
  (Brochhagen et al., en _Linguamática_) halló que los chatbots tienden a formas
  no normativas de influencia castellana en catalán.
- **Arreglo:** la forma normativa; compruébala en Fundéu o el DPD (es) o en la
  AVL / DNV (va) antes de codificarla.
- **Fiabilidad:** débil como marca de máquina (las personas también calcan);
  útil siempre como corrección.
- **Casa:** el valenciano del sitio usa la serie «este / eixe»; un texto que
  salta entre «aquest» y «este» suena sin localizar. Sigue la serie que ya use
  la superficie; si no hay ninguna, pregunta al operador.

### V6 · Relleno de tono (marcas de Claude)

- **Busca:** en _quietly, genuinely, plainly, honestly, load-bearing_ en
  sentido figurado, _the real / useful / right question_. es
  «silenciosamente», «honestamente», «la verdadera pregunta», «la pregunta
  útil».
- **Por qué:** listas comunitarias (claudisms.ai; un hilo de Hacker News de
  agosto de 2026 que mide descripciones de PR) señalan este grupo en Claude.
  **Evidencia baja:** no hay estudio publicado.
- **Arreglo:** quítalo cuando no diga nada, o di el contraste concreto que
  insinúa («quietly dropped» → «retirado sin aviso en el BOP del 3 de
  marzo»). Aviso 4: si la palabra hace su trabajo, se queda.
- **Casa:** el propio `CLAUDE.md` usa «load-bearing». Escanea también los
  borradores del operador, no sólo lo que sale del modelo.

---

## 2. Construcciones

### K1 · Paralelismo negativo

- **Busca:** «no se trata solo de X, sino de Y», «no solo… sino también», «no
  es X: es Y». en _not just X but Y_, _it's not X, it's Y_, y las variantes
  que más salen en 2025–26: _the useful question is not "X" but "Y"_, la
  aposición _X, not Y_ («they measure agreement, not accuracy») y _by
  measuring, never by assertion_. va «no és només… sinó», «no sols… sinó».
- **Ej.:** en "It's not just a website, it's a movement" · ru [параллелизмы с
  уточнениями; «не только…, но и…»].
- **Arreglo:** di la afirmación positiva. Si quitar la mitad negativa no cambia
  nada, sobraba.
- **Fiabilidad:** débil. «No solo… sino» es normal en el castellano académico
  humano (RILEX, U. de Jaén).
- **Casa:** se queda cuando **corrige una mala lectura concreta** de una cifra
  o un estado («No es que la cobertura sea cero: es que no se ha podido
  calcular»; un cero no es un «no consta»). Se queda también el lema canónico
  de `docs/DESCRIPCION.md`, literal. Los correctivos no tienen tope: pueden
  ser varios en un texto si cada uno corrige una lectura concreta («agreement,
  not accuracy» dice algo que el lector podría leer al revés). El tope de
  **uno por texto** vale sólo para los que dan ritmo.

### K2 · «Y rather than X»

- **Busca:** en _rather than_ como reflejo de contraste.
- **Por qué:** WP:AISIGNS la registra como casi inexistente antes de mediados
  de 2026 y frecuente desde entonces. En castellano, «en lugar de» es tan común
  que no se señala.
- **Fiabilidad:** débil. Aviso 4: no se cambia sólo por ser _rather than_;
  sí cuando el contraste sobra.

### K3 · Gerundio de cola que interpreta

- **Busca:** «…, subrayando / reflejando / consolidando / contribuyendo a /
  garantizando…» al final de una frase de hechos. en _…, highlighting /
  underscoring / ensuring / fostering / reflecting…_; va «…, reflectint /
  subratllant / contribuint / garantint…». También el verbo conjugado con un
  hecho o un documento de sujeto: «El dato subraya…», «El acuerdo refleja…»,
  "The figure underscores…" (ВП:ПРГЕН §1.3).
- **Ej.:** es «El pleno aprobó la modificación, reflejando su compromiso con la
  transparencia» · ru [поверхностный анализ; «подчёркивая», «отражая»].
- **Por qué:** los modelos ajustados por instrucciones usan cláusulas de
  participio de presente entre dos y cinco veces más que las personas (Reinhart
  et al., _PNAS_, 2025). Es el rasgo gramatical que sobrevive a cualquier lista
  de palabras. Y es el más peligroso para este proyecto: **pega una
  interpretación a una cita**, y una herramienta de búsqueda puede atribuírsela
  a una fuente que no la dice. Señal más fuerte: el sujeto que «subraya» es un
  hecho, no una persona.
- **Arreglo:** parte la frase. O la interpretación tiene fuente («según el
  acta, el concejal dijo…») o se va. En castellano suele ser además un
  **gerundio de posterioridad**: la _Nueva gramática_ (NGLE) lo censura cuando
  la consecuencia no es inmediata, y admite la posterioridad inmediata o casi
  simultánea («Salió dando un portazo»). Para el estilo administrativo, la
  referencia es la Guía de lenguaje claro GVA, §4.2.15.
- **Fiabilidad:** débil por sí sola; en un texto con citas, revisa cada una.

### K4 · Atribución vaga

- **Busca:** «según los expertos», «diversos estudios señalan», «algunos
  críticos», «es considerado como». en _experts argue, industry reports,
  observers have noted, widely regarded_.
- **Ej.:** ru [обтекаемые формулировки]: la pasiva «se describe como» que
  sugiere una fuente independiente cuando la cita es la web del propio sujeto.
- **Arreglo:** nombra la fuente y el documento, o quita la frase. Una sola
  fuente no es un consenso.
- **Fiabilidad:** débil como marca; **fuerte como defecto** en este proyecto.

### K5 · Charla de notoriedad

- **Busca:** en _independent coverage, featured in, media outlets, is listed
  in, active social media presence_; es «ha aparecido en diversos medios».
- **Por qué:** lista dónde se mencionó algo en vez de decir qué dijeron.
  WP:AISIGNS la ve más desde 2025; lo que sí está en su lista de marcas más
  comunes ahora es el énfasis en que algo figure en una base de datos o en
  fuentes primarias.
- **Variante (ВП:ПРГЕН §1.2):** atribuir en el texto un dato trivial e
  indiscutido («Según el registro mercantil, la empresa facturó…» en una
  frase que no lo necesita).
- **Arreglo:** qué publicó quién y cuándo, con enlace.
- **Fiabilidad:** débil; en una solicitud, sustituye «featured in» por la pieza
  concreta.
- **Casa:** en el sitio y en los escritos, citar la fuente de cada cifra es
  regla, no marca. La marca es atribuir en el texto un dato trivial en una
  solicitud o en prosa general.

### K6 · Cautela de chat sobre las fuentes

- **Busca:** es «con la información disponible», «no está ampliamente
  documentado», «la información es escasa»; en _based on available
  information, not widely documented_.
- **Por qué:** WP:AISIGNS la da por creciente en 2026. El patrón peligroso
  (ВП:ИИДИСКЛЕЙМЕР): reconoce que no hay datos y luego rellena con seguridad.
- **Arreglo:** di qué fuente falta y dónde se buscó.
- **Casa:** **no confundir** con el límite declarado del sitio («dónde se acaban
  los datos oficiales»): ése nombra el hueco concreto y su causa. Se queda.
  Tampoco con la frase que acota lo que prueba un documento concreto («un
  documento cotejado no basta por sí solo para afirmar X»; _does not by
  itself establish_): es una salvedad exacta, no una cautela de chat, y se
  queda. «Con la información disponible» se queda cuando nombra de verdad el
  límite de los datos.

### K7 · Fórmula «retos y perspectivas»

- **Busca:** «A pesar de sus logros, X se enfrenta a varios retos…» y un cierre
  sobre el futuro. en _despite…, faces several challenges; future outlook_.
- **Ej.:** ru [выводы о проблемах и перспективах на будущее].
- **Arreglo:** el problema concreto, con su dato. Lo que delata es la fórmula,
  no hablar de dificultades.
- **Fiabilidad:** débil; fuerte si cierra un texto.

### K8 · Rangos decorativos

- **Busca:** «desde X hasta Y, desde Z hasta W»; en _from X to Y, from Z to W_,
  donde los extremos no forman una escala.
- **Ej.:** ru [крайности, ВП:ЛОЖДИА].
- **Arreglo:** enumera.
- **Fiabilidad:** débil.

### K9 · Conexión vaga

- **Busca:** es «vinculado a», «asociado a», «relacionado con», «ligado a»,
  «en relación con»; va «vinculat a», «associat a», «relacionat amb»; en _in
  connection with, associated with, linked to, connected with_.
- **Ej.:** es «Los contratos vinculados al concejal de Urbanismo» (¿los
  firmó, los propuso, los adjudicó su área?).
- **Por qué:** WP:AISIGNS la pone entre las marcas más comunes en octubre de 2026. En un monitor cívico es además la manera más fácil de emborronar una
  relación entre un cargo y un dinero.
- **Arreglo:** la relación que documenta la fuente: adjudicó, firmó, votó,
  cobró, propuso. Si la fuente no la documenta, la frase se va.
- **Fiabilidad:** débil como marca; **fuerte como defecto** en este proyecto
  (como K4).

### K10 · Gerundio sin sujeto y relleno de oficio (sólo a mano)

- **Busca:** un gerundio o un participio cuyo sujeto implícito no es el sujeto
  de la frase («Utilizando este método, los resultados mejoran»; en _Using
  this method, results improve_); cadenas de nominalizaciones («se procedió a
  la realización de la evaluación»); pleonasmos («subir arriba», «el entorno
  que nos rodea»).
- **Ej.:** ru [бесконечные причастные и деепричастные обороты; канцелярит].
- **Por qué:** es el único rasgo propio del ensayo ruso (ВП:ПРГЕН, «Речевые
  обороты»): oraciones de participio sin fin, en las que se pierde quién hace
  qué, rellenas de lenguaje de oficio.
- **Arreglo:** nombra al agente y conjuga el verbo (GVA §4.2.9 y §4.2.13):
  «Con este método, ⟦quién⟧ obtiene resultados mejores».
- **Fiabilidad:** débil; también es el defecto clásico de la prosa
  administrativa humana.

---

## 3. Estructura y ritmo

### E1 · Metadiscurso que anuncia importancia

- **Busca:** «cabe destacar», «es importante señalar», «vale la pena
  mencionar»; en _it is important to note, it's worth noting, notably_.
- **Ej.:** ru [дидактические и редакционные оговорки; «важно отметить»].
- **Arreglo:** borra el marco y di el hecho. Si sin el marco no interesa,
  sobra.
- **Fiabilidad:** débil. En castellano no hay estudio que la valide: las
  listas son de prensa sin método, y la fórmula era corriente en prosa
  administrativa y periodística humana antes de 2022. WP la da por menguante
  en inglés.

### E2 · Apertura de escena

- **Busca:** «En el panorama actual», «En la era digital», «En un mundo cada
  vez más…»; en _In today's rapidly evolving landscape_.
- **Arreglo:** empieza por el hecho, la fecha o el documento.
- **Fiabilidad:** débil, por la misma razón que E1: «en el contexto actual» y
  «en los tiempos que corren» se escribían mucho antes de los modelos.

### E3 · Cierre que resume

- **Busca:** «En resumen», «En conclusión», «En definitiva», «En última
  instancia», «Al final del día»; un último párrafo que repite el texto.
- **Ej.:** ru [отдельный раздел для краткого содержания; «подводя итог»].
- **Arreglo:** termina en el último hecho nuevo o en lo que el lector puede
  hacer.
- **Casa:** el rótulo de la lectura «esencial» y cualquier etiqueta que nombra
  una caja de resumen no es marca. Una carta a la administración que repite la
  petición al final, sí.

### E4 · El texto se describe a sí mismo

- **Busca:** «En este artículo exploraremos…»; en _In this report we will
  explore_. También el título tratado como término definido (ru: [отношение к
  названиям статей как к определениям]).
- **Arreglo:** fuera.
- **Fiabilidad:** fuerte.

### E5 · Conectores de arranque en serie

- **Busca:** «Asimismo», «Además», «Por otro lado», «No obstante», «En este
  sentido» abriendo párrafo tras párrafo; en _Additionally, Moreover,
  Furthermore_.
- **Arreglo:** quítalos salvo que la relación lógica no se entienda sin ellos.
- **Fiabilidad:** débil; WP los da como **no fiables sueltos**. El escáner sólo
  avisa a partir de tres.

### E6 · Ritmo uniforme / sólo comas y puntos

- **Busca:** frases de longitud parecida (8–20 palabras), párrafos simétricos
  (tesis, tres puntos, cierre). En inglés, desde septiembre de 2026, prosa sin
  dos puntos, paréntesis ni punto y coma: efecto secundario de enseñar a los
  modelos a no usar la raya (WP:AISIGNS).
- **Arreglo:** no es motivo de cambio por sí solo; cambia una frase sólo si
  al lector le cuesta seguirla. **No** partas una frase larga que lleva su
  matiz dentro (aviso 4).
- **Casa:** las frases largas de Metodología y de los reportajes que llevan la
  advertencia junto a la cifra son precisión. No se trocean por «ritmo».
- **Fiabilidad:** débil; el escáner la da como nota de conjunto.

### E7 · Regla de tres (sólo a mano)

- **Busca:** tríadas de adjetivos o de sintagmas que hacen parecer completo un
  análisis superficial. «transparencia, rendición de cuentas y participación».
- **Ej.:** ru [«правило трёх»].
- **Arreglo:** deja los elementos que tienen contenido; si son dos, dos.
- **Casa:** se queda cuando la lista **es exhaustiva de hecho** (las tres
  formas legales de resolver una solicitud; los tres sujetos que no se
  puntúan: «ni del ayuntamiento, ni de un servicio, ni de un concejal»).

### E8 · Densidad de aforismos (sólo a mano)

- **Busca:** cada sección termina en una máxima; quiasmos; frases-eslogan que
  repiten el título de la sección.
- **Por qué:** es la marca que más aparece en los borradores de este repo; las
  léxicas casi no salen.
- **Arreglo:** una máxima por texto como mucho. El resto, el hecho que la
  sostiene.
- **Casa:** los lemas canónicos de `docs/DESCRIPCION.md` se citan literales.

### E9 · Variación elegante (sólo a mano)

- **Busca:** el sujeto nombrado una vez y luego rotando sinónimos («el
  consistorio», «la corporación», «la institución local»).
- **Ej.:** ru [избегание частого повторения слов].
- **Por qué:** la penalización por repetición del entrenamiento.
- **Arreglo:** un término por cosa. En un escrito administrativo o legal la
  terminología constante es además precisión: «la solicitud» no se convierte
  en «la petición» y «el escrito» tres líneas después.
- **Fiabilidad:** débil (algunas escuelas lo enseñan; también lo hacen los
  hablantes de una segunda lengua). El ensayo ruso añade que no cuenta cuando
  los fragmentos se escribieron por separado y se juntaron después.

### E10 · Inventario en una frase (sólo a mano)

- **Busca:** una frase de cien palabras que enumera funciones con rayas y
  comas.
- **Arreglo:** las dos o tres cosas que importan para ese lector, con enlace al
  resto. Suele llevar además recuentos que caducan (C5). Nunca se recorta una
  salvedad ni la declaración de un límite, ni se acorta una declaración de
  uso de IA.

---

## 4. Formato y tipografía

### F1 · Títulos en Title Case

- **Busca:** «Cómo Funciona El Presupuesto Municipal».
- **Arreglo:** en castellano y valenciano, sólo la primera palabra y los nombres
  propios; también tras dos puntos.
- **Fiabilidad:** norma en es/va (error ortotipográfico, no de autoría);
  estilo en inglés, donde es válido.
- **Casa:** los nombres de campo copiados del formulario de una convocatoria
  («Full Name of the Nominee») no son marca. El escáner no mira los títulos
  cuando el fichero parece un borrador de formulario, y con `--campos` no los
  escanea.

### F2 · Comillas inglesas en primer nivel (es/va)

- **Busca:** “…” donde va «…».
- **Arreglo:** «» primero, “” dentro, ‘’ dentro de éstas (RAE; GVA §7.2.1).
- **Fiabilidad:** norma.
- **Casa:** las comillas encierran citas literales o mencionan una palabra
  como palabra; nunca dan énfasis ni ironía. Una prueba vigila que lo
  entrecomillado de un hallazgo esté en su transcripción.

### F3 · Ortografía del castellano

- **Busca:** meses y días con mayúscula («9 de Noviembre»), «?» sin «¿»,
  ordinales y abreviaturas inglesas («1ro», «Nov.»).
- **Fiabilidad:** norma: incumple la RAE con fiabilidad, pero no dice quién
  escribió el texto.
- **Casa:** «sólo», «ésa», «éste» con tilde son elección de la casa: no se
  «corrigen».

### F4 · Saludo con coma (castellano)

- **Busca:** «Estimado Sr. García,». En castellano, dos puntos («Estimado
  señor:»).
- **Fiabilidad:** norma en castellano. En valenciano no se señala: la coma
  tras «Benvolgut senyor» es de uso corriente **(verifica en la AVL u
  Optimot si hace falta fijarlo)**.

### F5 · Raya y em dash

- **Busca (en):** la raya usada donde iría una coma, dos puntos o paréntesis,
  con ritmo de anuncio. WP:AISIGNS la saca de la lista principal en 2026 porque
  los modelos más nuevos ya casi no la usan, pero Claude la usa más que los
  redactores profesionales (estudio de julio de 2026 citado por WP; no leído
  directamente).
- **Busca (es/va):** la raya espaciada como **coda** inglesa («El dato — es lo
  que puedes comprobar»). En castellano la raya abre y cierra el inciso pegada
  a él: «Los solicitantes —mayores de edad— deberán…».
- **Fiabilidad:** débil; el ensayo ruso insiste en que sola no prueba nada.
- **Casa:** la raya es puntuación normal en castellano y el sitio la usa por
  todas partes. Los lemas canónicos de `docs/DESCRIPCION.md` llevan la raya de
  coda («…y cuánto cuesta — con una fuente para cada cifra»; «…what it costs —
  with a citation for every figure»): se citan así, y el escáner los lee de
  allí y no los señala. **No se reescribe copia publicada para quitarla**: se
  señala sólo en texto nuevo. En inglés, la raya se cambia sólo si una coma,
  dos puntos o un paréntesis se leen más claro (aviso 4).

### F6 · Separadores numéricos ingleses

- **Busca:** «1,234.56» en castellano.
- **Arreglo:** coma decimal, punto de millar, espacio antes de % («77,53 %»).
  El dinero, sólo con los formateadores de `src/lib/formatters.js`.
- **Fiabilidad:** norma.

### F7 · Artefactos de un chat

- **Busca:** `utm_source=chatgpt.com` / `openai` / `copilot.com`,
  `referrer=grok.com`, `oaicite`, `contentReference[…]`, `↩`, `<mark>`.
- **Fiabilidad:** fuerte; WP:AISIGNS los trata como inequívocos.
- **Arreglo:** quítalos y **abre la fuente a mano**: si vino de un chat, puede
  no decir lo que se le atribuye (C4).

### F8 · Markdown donde no se renderiza

- **Busca:** `**negrita**`, `##`, `---`, `[texto](url)`, viñetas con rótulo en
  negrita y dos puntos, emoji al inicio de línea, en un correo, un campo de
  formulario o un escrito a sede electrónica.
- **Ej.:** ru [использование Markdown; чрезмерное использование жирного
  шрифта; вертикальные списки с заголовками].
- **Fiabilidad:** en destino plano, norma: se quita siempre, pero sola no
  dice nada de autoría (el ensayo ruso advierte que mucha gente escribe en
  Markdown, y la da por fuerte sólo junto a otras marcas o con sintaxis rota
  del destino). En un `.md`, débil.
- **Variante:** negrita repartida por el cuerpo, en cada término clave de un
  párrafo, aunque el destino la muestre (un PDF, una página). Débil, con la
  salvedad del ensayo ruso: a los modelos nuevos se les pide no abusar de la
  negrita, así que su ausencia no prueba nada.
- **Casa:** la negrita de arranque es formato de la casa en documentos internos
  y en el registro de correcciones. En un formulario de texto plano, se quita.

---

## 5. Contenido y fuentes

### C1 · Pérdida de especificidad (raíz de casi todo; sólo a mano)

- **Busca:** frases que podrían decirse de cualquier municipio, proyecto o
  persona.
- **Por qué:** el modelo prefiere la formulación media y descarta el dato raro
  (ВП:СНИИ: «revolucionó la industria» en lugar de «inventó el primer
  enganche de vagones»).
- **Arreglo:** quién, qué, cuándo, cuánto, qué documento. Lo que sólo sabe el
  operador va en ⟦…⟧; **nunca se inventa** un hecho, una anécdota o un mérito
  para sonar humano.

### C2 · Absolutos

- **Busca:** «nunca», «nadie», «nada», «ninguno», «siempre», «el único», «en
  ningún caso», «sin excepción»; va «mai», «ningú», «res», «cap», «sempre»;
  en _never, nobody, nothing, none, no person, the only, first-ever,
  unprecedented_. Y los universales, que suelen ser ciertos pero no siempre:
  «cada», «todos los», «tots els», _every, all the_. El escáner los lista
  aparte.
- **Por qué:** en este repo es el problema más frecuente y el más caro: una
  frase sobre lo que la IA «nunca» hace en el proyecto resultó falsa contra el
  propio sitio, que publica texto redactado por máquina y lo etiqueta.
- **Arreglo:** compruébalo hoy. Si no es cierto entero, acótalo («ningún otro
  municipio de la comarca que hayamos encontrado»). Sobre lo que hace la
  máquina en el proyecto, usa el alcance de la frase canónica de
  `/metodologia` («un cargo concreto», con sus excepciones nombradas).
- **Casa:** no se listan los lemas canónicos («con una fuente para cada
  cifra») ni la fórmula del registro de correcciones («Ninguna cifra cambia»,
  «Ningún otro hecho publicado cambia»), que es el modelo de prosa de la
  casa.
- **Fiabilidad:** no es una marca de estilo; el escáner lo lista aparte como
  afirmación por comprobar.

### C3 · Eco del vocabulario del financiador (sólo a mano)

- **Busca:** la respuesta repite las palabras de la pregunta o de la misión de
  la convocatoria («serves resilient communities»). Variante (ВП:ПРГЕН §3.1):
  el texto afirma que se escribió para el destino y que cumple todas sus
  reglas («this proposal fully aligns with the call's criteria»).
- **Arreglo:** di qué puede comprobar ahora un vecino que antes no podía. Si
  cumple los criterios, que lo muestre el contenido.
- **Casa:** usar la categoría o los requisitos de la convocatoria para mostrar
  que se encaja no es marca («A breakthrough-stage project, not sustained
  excellence» responde a las dos categorías del premio). Lo es repetirlos como
  relleno.

### C4 · Citas que no existen o no dicen eso (sólo a mano; el peor)

- **Busca:** enlaces muertos sin copia archivada en un texto nuevo; ISBN con
  dígito de control erróneo; DOI que lleva a otro artículo; libro sin página;
  artículo de ley con número inventado; órgano o procedimiento con nombre
  inventado (C8); ley equivocada (acceso a información:
  Ley 19/2013 y, en la Comunitat Valenciana, Ley 1/2022; la LPACAP es
  procedimiento).
- **Ej.:** ru [подлог источников; некорректные ISBN и DOI].
- **Por qué:** es el único grupo que es un defecto de **verdad** y no de estilo.
  El ensayo ruso avisa: un texto generado revisado por una persona puede seguir
  escondiéndolo.
- **Arreglo:** abre cada fuente y busca la frase. En este repo:
  `check:citations` para los informes del agente; `revisar-borrador` para
  «¿el extracto sostiene la frase?».

### C5 · Cifras congeladas (sólo a mano)

- **Busca:** recuentos, totales y porcentajes escritos a mano en prosa.
- **Arreglo:** en el sitio, derivarlos del dato. En una solicitud, volver a
  contarlos el día del envío y dividir numerador, denominador y porcentaje.

### C6 · Interpretación pegada a una cita

- **Busca:** K3 cuando la frase lleva fuente. La fuente dice el hecho; la
  coletilla añade una valoración que la fuente no hace.
- **Arreglo:** separa hecho y valoración; la valoración necesita su propia
  fuente o se va.

### C7 · Huecos y plantillas sin rellenar

- **Busca:** «[Nombre del solicitante]», `2026-XX-XX`, `INSERT_…`,
  `example.com`, y los ⟦…⟧ de la casa.
- **Fiabilidad:** fuerte como marca; bloqueante como estado (no se envía).
- **Casa:** ⟦…⟧ es la convención correcta en un borrador: marca lo que sólo el
  operador puede escribir. Se rellena antes de enviar.

### C8 · Nombre inventado de órgano, procedimiento, registro o formulario (sólo a mano)

- **Busca:** el nombre de un órgano, una unidad, un registro, un formulario o
  un procedimiento que suena bien y no existe: «Consejo de Transparencia
  Valenciano», «Registro Municipal de Contratos», «Departamento de Gestión
  Ciudadana», «solicitud de acceso por vía de urgencia».
- **Ej.:** ru [несуществующие категории, ВП:ПРГЕН §5.2], trasladado a los
  nombres oficiales.
- **Por qué:** en un escrito a una administración es tan probable como el
  artículo inventado (C4), y hace que el escrito vaya al sitio equivocado. El
  ensayo ruso avisa de que los recién llegados cometen el mismo error: no
  prueba autoría.
- **Arreglo:** copia el nombre exacto de la sede electrónica del órgano o del
  DIR3, y el del procedimiento, de su catálogo de procedimientos.
- **Fiabilidad:** débil como marca; bloqueante como defecto.

### C9 · Dos cifras sin puente (sólo a mano)

- **Busca:** dos cifras cercanas de universos distintos en el mismo texto: el
  denominador del estudio de desiertos informativos y el censo vigente de
  municipios (las dos están, con su razón, en `docs/DESCRIPCION.md` §Reglas de
  registro); un total de contratos indexados y otro de adjudicados.
- **Por qué:** las dos son ciertas y separadas a propósito, pero el lector, o
  un jurado, lee una incoherencia.
- **Arreglo:** nombra la diferencia («⟦n⟧ en el estudio de 2023; hoy son
  ⟦m⟧») o deja sólo la que la frase necesita, con el visto bueno del
  operador. Quitar una cifra no es cambiarla, pero sí es suprimir: el paso 6
  de `SKILL.md` lo pide explícito. El procedimiento completo está en el
  skill `revisar-superficies`.

---

## 6. Tono

### T1 · Frases dirigidas al usuario del chat

- **Busca:** «¡Claro!», «Espero que esto te ayude», «¿Quieres que lo
  amplíe?»; en _Certainly!, I hope this helps, Let me know if_.
- **Ej.:** ru [имитация диалога; ВП:Конечно].
- **Fiabilidad:** fuerte. va «Clar!», «Espere que això t'ajude».

### T2 · Cortesía de plantilla

- **Busca:** «Espero que este mensaje le encuentre bien», «No dude en
  contactarme», «Gracias de antemano», «Quedo a la espera de su pronta
  respuesta», «Me pongo en contacto con ustedes para…»; en _I hope this
  finds you well, don't hesitate to, I am writing to request_.
- **Busca también:** el cargo del destinatario o el nombre del órgano mal
  puestos («Sr. Alcalde-Presidente del Consell Comarcal»), o una forma de
  tratamiento que no corresponde (ВП:ПРГЕН §3.3).
- **Por qué:** ningún registro nativo dice la primera; las demás son
  plantilla, pero **también humana**: se escribían en castellano mucho antes
  de 2022, y los cursos de inglés formal enseñan _I am writing to request_.
  El ensayo ruso describe lo mismo en peticiones a editores: encabezado de
  correo, «espero que se encuentre bien», el cargo del destinatario mal
  nombrado.
- **Arreglo:** al hecho; el correo termina cuando termina la petición. El
  cargo y el órgano, copiados de la sede electrónica o del DIR3 (C8).
- **Fiabilidad:** débil, salvo «espero que este mensaje le encuentre bien»,
  que no tiene uso nativo.

### T3 · Fórmulas arcaicas de oficio

- **Busca:** «Que por medio del presente escrito», «Es por lo que», «Sin otro
  particular, aprovecho la ocasión para saludarle».
- **Arreglo:** fuera (GVA §4.2.17). No son de máquina, pero tampoco de quien
  escribe claro.
- **Casa:** «Al amparo de…», «EXPONE», «SOLICITA», «PRIMERO.—» son el género y
  se quedan.

### T4 · Tú y usted mezclados (sólo a mano)

- **Busca:** cambio de tratamiento dentro de un texto; señal frecuente de
  traducción.
- **Casa:** el sitio trata de «tú»; una carta a la administración, de «usted».

### T5 · Valor anunciado (sólo a mano)

- **Busca:** «esto importa», «la pregunta correcta», «lo que nadie cuenta»;
  falsa intimidad («no puedo dejar de pensar en…»).
- **Arreglo:** muestra por qué importa con el hecho; si no se puede, sobra.

### T6 · Imputación de intención (regla de la casa, sólo a mano)

- **Busca:** «lo que te ocultan», «colocan a los suyos».
- **Arreglo:** lo comprobable, y la conclusión la saca el lector
  (`docs/DESCRIPCION.md` §Reglas de registro). No es una marca de máquina, pero
  una reescritura «con más fuerza» tiende a producirla.

---

## 7. Indicadores que no sirven (no los uses para juzgar)

Gramática perfecta; registro mixto; prosa sosa o rebuscada; un conector
suelto; texto sin fuentes; marcado correcto (WP:AISIGNS). Un detector
automático: el ensayo ruso y WP lo descartan como prueba; siete detectores
marcaron como generados de media un 61 % de ensayos de TOEFL escritos por
personas (Liang et al., 2023), y quien escribe en una segunda lengua, como el
operador, es justo el perfil penalizado. Los detectores comerciales mejores
aciertan mucho en textos largos en inglés (Jabarian e Imas, 2025), pero eso no
cambia la regla: **un detector no es la prueba de aceptación de este skill.**

Los lectores expertos que usan modelos a menudo los reconocen muy bien: en un
estudio de 2025 (Russell et al.), la mayoría de cinco anotadores de ese perfil
falló uno de trescientos artículos, también con texto «humanizado». Los no
expertos, apenas mejor que el azar (un estudio de 2025); con tesis en alemán,
alrededor de un 57 % de acierto. Y la gente ya escribe y habla con estas
palabras (Yakura et al.), así que acusar por una marca es arriesgado. Los
evaluadores de convocatorias y los periodistas son a menudo el lector
experto. La consecuencia no es humanizar mejor: es declarar donde se pide y
dejar que lo que sólo sabe la persona lo escriba ella.

---

## Fuentes (leídas el 09-11-2026)

- Википедия: Признаки сгенерированности текста (ВП:ПРГЕН), revisión 156024043
  del 05-11-2026. Ensayo, no política; el criterio de borrado rápido С7 lo cita
  con la salvedad de que no basta por sí solo.
  https://ru.wikipedia.org/wiki/Википедия:Признаки_сгенерированности_текста
- Wikipedia: Signs of AI writing (WP:AISIGNS) y su página de discusión
  (septiembre–noviembre de 2026). https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
- Kobak, González-Márquez, Horvát, Lause, _Science Advances_ 11(27), 2025,
  doi:10.1126/sciadv.adt3813.
- Juzek y Ward, «Why Does ChatGPT “Delve” So Much?», COLING 2025.
- Reinhart et al., «Do LLMs write like humans?», _PNAS_ 122(8), 2025,
  doi:10.1073/pnas.2422455122.
- Russell, Karpinska, Iyyer, ACL 2025, arXiv:2501.15654.
- Yakura et al., arXiv:2409.01754 (v3, julio de 2025).
- Paech et al., «Antislop», arXiv:2510.15061, 2025.
- Liang et al., _Patterns_, 2023, doi:10.1016/j.patter.2023.100779.
- Weber-Wulff et al., _Int. J. Educational Integrity_ 19:26, 2023.
- Jabarian e Imas, U. Chicago BFI WP 2025-116.
- Generalitat Valenciana, _Guía de lenguaje claro_, julio de 2023
  (§4.2.5–4.2.17, §6.2.2, §7.2).
- UDEP _Castellano actual_ («jugar un papel»; raya y guion); RAE, DLE;
  _Diccionario panhispánico de dudas_ (2005) y _Nueva gramática_ (NGLE) para
  V5 y K3, de memoria **(verifica)**.
- Àccent Obert / UPF sobre chatbots y castellanismos en catalán, vía Ara y
  VilaWeb.
- Listas comunitarias de baja evidencia: claudisms.ai; Hacker News
  item 49461817 y 48905248; aitmpl.com «avoid-ai-writing».
- Prensa en castellano sin método (ADN40, Noticias de Navarra, Applesfera,
  findskill.ai): sólo para la lista de metadiscurso.
- La Wikipedia en castellano no tiene página equivalente (la ruta obvia daba 404
  el 09-11-2026).
