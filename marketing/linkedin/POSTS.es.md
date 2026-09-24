# CivicPulse en LinkedIn — serie de 12 publicaciones

Versión en inglés: [`POSTS.md`](POSTS.md).

Una imagen por publicación en `images/es/post-NN.png` (1080×1350, 4:5 — el
formato más alto que LinkedIn muestra sin recortar en el feed).
`images/es/post-00.png` es la hoja de estilo, para ti, no para publicar.

**Ritmo.** Dos publicaciones por semana (martes y jueves por la mañana) son
seis semanas. Las líneas se alternan a propósito, para que nunca salgan dos
publicaciones técnicas seguidas:

| Nº  | Línea                         | Gancho                                                            |
| --- | ----------------------------- | ----------------------------------------------------------------- |
| 01  | Idea                          | Lo pagas cada año. ¿Has leído alguna vez sus cuentas?             |
| 02  | Problema cívico               | A la mayoría de ayuntamientos de España no los vigila nadie.      |
| 03  | Cómo funciona el ayuntamiento | El interventor necesita una oposición. El concejal, tu voto.      |
| 04  | Problema cívico               | La ley de transparencia produce documentos. La gente, preguntas.  |
| 05  | Cómo funciona el ayuntamiento | Un presupuesto no es lo que se gastó.                             |
| 06  | Cómo funciona el ayuntamiento | Servicios que nunca aparecen en las cuentas municipales.          |
| 07  | Método                        | Nuestro mapa de contratos muestra el 1,8 % del dinero. Y lo dice. |
| 08  | Método                        | Un año que falta no es un cero.                                   |
| 09  | Idea                          | Publicamos el método, no un ranking.                              |
| 10  | Idea                          | La máquina puede retirar. Solo una persona publica.               |
| 11  | Ingeniería                    | Nuestros tests estaban en verde. No medían nada.                  |
| 12  | Idea                          | Mayo de 2027: 8.131 ayuntamientos ante las urnas.                 |

**Normas de la casa para el texto** (las mismas que sigue la web):

- Nunca se nombra a un concejal ni a un cargo. Las publicaciones hablan de cómo
  funciona el sistema, y en LinkedIn no hay derecho de réplica.
- «Gastado» solo junto a las obligaciones reconocidas. Nunca junto al crédito
  inicial, al definitivo ni a un importe contratado.
- Cada cifra de un texto aparece en su imagen con la fuente en el pie. Si el
  dato cambia, vuelve a generar las imágenes (`node render.mjs --lang es`) y
  actualiza la cifra en el texto.
- Los enlaces van en el primer comentario, no en el cuerpo: LinkedIn penaliza
  las publicaciones con enlaces externos.

---

## Nº 01 · Idea — Lo pagas cada año

Imagen: `images/es/post-01.png`

> Pagas tu ayuntamiento cada año. ¿Has leído alguna vez sus cuentas?

Tu ayuntamiento decide tu calle, tu recibo del agua, tu licencia de obra, el
camino al colegio y qué empresa cobra por recoger tu basura.

Nadie invertiría en una empresa sin ver sus cuentas ni saber quién la dirige.
A esta la financias quieras o no. Y en la mayor parte de España nadie la
revisa por ti.

Los datos para revisarla ya existen. Son públicos y están repartidos en una
docena de portales oficiales, cada uno pensado para demostrar que se cumplió la
ley, no para responder a lo que pregunta un vecino.

Por eso he construido **CivicPulse**: un ayuntamiento, Riba-roja de Túria
(València), reconstruido desde el lado del vecino. Quién lleva cada área.
Cuánto cuesta cada servicio. Quién se llevó el contrato. Qué se votó. Qué se
prometió.

Cada cifra de la web lleva su fuente, a un clic. Lo que no podemos citar, no lo
publicamos.

En las próximas semanas contaré lo que construirla me ha enseñado sobre cómo
funciona de verdad la administración local, y sobre los sitios donde se
acaban los datos oficiales.

Primer comentario: civicpulse.es

#TecnologíaCívica #DatosAbiertos #Transparencia #Ayuntamientos #CivicTech

---

## Nº 02 · Problema cívico — No los vigila nadie

Imagen: `images/es/post-02.png`

> El 77,53 % de los municipios de España no tiene ninguna redacción local que
> los vigile.

Son 6.304 de 8.131 municipios. En estos «desiertos informativos» viven 11,6
millones de personas (Negreira-Rey, Vázquez-Herrero y López-García, 2023).

La prensa nacional cubre la política nacional, y los verificadores, el debate
nacional. El gobierno que decide tu calle, tu recibo del agua y tu contrato de
basuras no suele tener a nadie en el pleno, nadie leyendo el presupuesto y
nadie preguntando por qué un contrato fue a donde fue.

No es una queja contra los periodistas. Una redacción local cuesta dinero, y en
un pueblo de 20.000 habitantes los anuncios que la pagaban ya no están.

**Qué hace CivicPulse:** la parte rutinaria del trabajo de esa redacción que
falta la pueden hacer las máquinas a partir de datos públicos. Eso incluye
recoger cada contrato, cada partida del presupuesto, cada transcripción del
pleno y cada promesa electoral, y mantener el registro al día cada noche. Las
decisiones de criterio las toma un curador humano.

Lo estamos haciendo primero en un municipio, entero. Los datos de base vienen
de fuentes nacionales indexadas por código de municipio, así que está hecho
para escalar a los 8.131.

#DesiertosInformativos #PeriodismoLocal #Periodismo #Democracia #DatosAbiertos

---

## Nº 03 · Cómo funciona el ayuntamiento — Dos niveles, dos controles

Imagen: `images/es/post-03.png`

> Quien fiscaliza el dinero de tu ayuntamiento necesita una carrera y una
> oposición nacional. Quien lo gobierna necesita tu voto.

Poca gente sabe que un ayuntamiento tiene dos niveles, y que la ley controla
cada uno de forma completamente distinta:

🔹 **La secretaría y la intervención**, que dan fe de los acuerdos y
fiscalizan el dinero, tienen un control _técnico_: titulación universitaria y
oposición de habilitación nacional (RD 128/2018, arts. 17–19).

🔹 **Los concejales** tienen un control _electoral_: ser mayor de edad, estar
en el censo y no estar inhabilitado (LOREG, art. 6.1). No se exige ninguna
titulación.

Lo segundo no es un vacío legal. Es así por diseño, porque la democracia
representativa no reparte títulos. No defiendo que deba hacerlo.

Lo que defiendo es más modesto y más difícil de discutir: **si el control es el
voto, el votante necesita los hechos.**

**Qué hace CivicPulse:** de cada cargo publica lo que declaró (formación,
experiencia, dedicación, la retribución fijada para el puesto) junto a lo que
la ley exige al puesto y las áreas que gestiona. No añade comentarios ni
puntuaciones, y todo está citado a la propia publicación del ayuntamiento. La
conclusión la saca el votante.

#AdministraciónLocal #Democracia #Transparencia #Ayuntamientos #España

---

## Nº 04 · Problema cívico — Documentos frente a preguntas

Imagen: `images/es/post-04.png`

> La ley de transparencia produce documentos. La gente tiene preguntas.

Todo municipio español está obligado a tener un portal de transparencia (Ley
19/2013, arts. 5–8). La mayoría lo tiene, y publica la relación de puestos de
trabajo, los PDF del presupuesto, fichas de obra, currículos de concejales y
actas de pleno. Todo es real.

Pero las preguntas de un vecino son estas:

- ¿Es caro esto?
- ¿Se llegó a hacer?
- ¿Va a mejor o a peor?
- ¿A quién le pregunto?

Ninguna se puede responder con un documento. Hacen falta una **serie** (la
misma cifra a lo largo de los años), un **denominador** (por habitante, por
tonelada, por punto de luz) y una **comparación** (municipios del mismo
tamaño). La ley se escribió para comprobar que se cumple, así que produce
archivos, no respuestas.

**Qué hace CivicPulse:** toma los mismos datos públicos y hace la ingeniería
que al portal nunca se le pidió. Por ejemplo, calcula el coste por unidad de
cada servicio municipal frente a municipios de su tamaño, con los datos de
coste efectivo del propio Ministerio de Hacienda. Convierte un montón de PDF en
una cifra que se puede seguir en el tiempo.

La distancia entre «publicado» y «legible» es un problema de ingeniería, y
solo hay que resolverlo una vez por país.

#Transparencia #DatosAbiertos #GovTech #SectorPúblico #IngenieríaDeDatos

---

## Nº 05 · Cómo funciona el ayuntamiento — Un presupuesto no es lo que se gastó

Imagen: `images/es/post-05.png`

> El presupuesto de un municipio y lo que de verdad gastó son cifras distintas.
> En Riba-roja, en 2025, la diferencia fue de más de 3 veces.

Un presupuesto municipal tiene varias magnitudes, y noticias, notas de prensa y
discursos políticos las mezclan a menudo en una sola palabra: «gastado».

Según el propio estado de ejecución de 2025 del ayuntamiento (listado a
31/12/2025):

- **Crédito inicial**, lo que aprobó el pleno: 37,60 M€
- **Modificaciones** durante el año: +24,52 M€
- **Crédito definitivo**, el techo de lo que podía gastar: 62,12 M€
- **Obligaciones reconocidas**, lo realmente gastado: **18,91 M€**

Si lees 62,12 M€ como «gastado», te equivocas por 3,3×. Todas las cifras de
arriba son correctas. Lo que falla es la palabra, y ninguna comprobación de
datos puede detectar una palabra equivocada.

Cometimos este error en nuestra propia web siete veces en un solo día.

**Qué hace CivicPulse:** cada vez que se revisan los textos de la web se
ejecuta una comprobación determinista. Conoce estas magnitudes y señala
cualquier palabra de ejecución («gastado», «se gasta») que acompañe a una cifra
que no es ejecución. No interviene ninguna IA, así que no hay nada que pueda
inventarse.

#FinanzasPúblicas #Presupuestos #AlfabetizaciónDeDatos #Ayuntamientos #Verificación

---

## Nº 06 · Cómo funciona el ayuntamiento — Servicios fuera de las cuentas

Imagen: `images/es/post-06.png`

> Hay servicios públicos que nunca aparecen en las cuentas del ayuntamiento, y
> es legal.

Cuando un ayuntamiento presta un servicio mediante concesión (el agua, por
ejemplo), la concesionaria suele cobrar directamente al vecino. El dinero va de
tu cuenta a la empresa y nunca pasa por el presupuesto municipal.

Así que, si buscas cuánto «gasta» tu municipio en ese servicio, puedes
encontrar un vacío o un cero, y es fácil concluir que alguien esconde algo o
que los datos están mal.

Normalmente no es ninguna de las dos cosas. Ese cero es **otro hecho**: el
servicio existe y lo pagas, pero las cuentas del ayuntamiento nunca fueron el
sitio donde ese dinero iba a aparecer.

**Qué hace CivicPulse:** donde las rendiciones de coste del Ministerio muestran
ese hueco, no dejamos un vacío que parezca ignorancia. La página del servicio
nombra a la empresa, la adjudicación y el importe, para que el vecino vea a
quién se paga realmente y en qué condiciones.

Para mí, un vacío sin explicar es peor que una cifra equivocada, porque el
lector no puede saber que está ahí.

#ServiciosPúblicos #ContrataciónPública #Ayuntamientos #Transparencia #España

---

## Nº 07 · Método — El mapa muestra el 1,8 % del dinero

Imagen: `images/es/post-07.png`

> Nuestro mapa de contratos muestra el 1,8 % del dinero, y lo dice en el propio
> mapa.

A todo el mundo le gusta un mapa de adónde va el dinero público. A mí también.
Esta es la versión honesta.

De los 124,04 M€ en contratos de Riba-roja en la Plataforma de Contratación del
Sector Público (2017–2026), solo 2,23 M€ se pueden poner en un mapa: 47 de 706
contratos. Son los que nombran un lugar concreto en su propio título.

El resto es limpieza viaria, alumbrado, mantenimiento e informática. Esos
contratos cubren todo el municipio, así que no hay dónde poner un pin.

Podríamos haber adivinado. Un geocodificador pondría encantado un pin en cada
contrato, y el mapa quedaría lleno e impresionante. También sería ficción.

**Qué hace CivicPulse:** nuestro emparejador de lugares se queda corto a
propósito, porque un fallo honesto vale más que un pin equivocado. El mapa
calcula su cobertura a partir de los datos y la imprime en el propio mapa. Una
capa que muestra una parte de sus datos tiene que decir qué parte.

Ese 1,8 % no es algo de lo que avergonzarse. Dice algo cierto sobre cómo
funciona el dinero municipal.

#VisualizaciónDeDatos #Mapas #DatosAbiertos #ÉticaDeDatos #TecnologíaCívica

---

## Nº 08 · Método — Un año que falta no es un cero

Imagen: `images/es/post-08.png`

> Un año que falta no es un cero. Muchos paneles de datos públicos lo hacen
> mal.

Cada año el Ministerio de Hacienda publica lo que cada municipio declara que le
cuestan sus servicios. La rendición de 2020 se publicó. La de Riba-roja no está.

La mayoría de paneles lo dibujarían como un hueco en la línea, un cero o un
guion. Los tres le dicen al lector algo falso.

Ahora distinguimos tres cosas que antes se veían iguales:

- **«Cero»**: el servicio se declaró y no costó nada
- **«No declarado»**: se presentó la rendición, pero este servicio no venía
- **«Nunca presentado»**: no se presentó rendición ese año

Son tres hechos distintos, y «nunca presentado» ya es un hecho sobre el
ayuntamiento.

**Qué hace CivicPulse:** la ausencia se dibuja, no se esconde. Cada caso tiene
su propia forma visual. Los datos que llegan tarde por ley (la rendición de
coste sale más de un año después del ejercicio que describe) llevan escrita la
norma que los retrasa, para que la página no parezca abandonada.

Para un vigilante, los huecos son donde está la rendición de cuentas.

#CalidadDelDato #DatosAbiertos #VisualizaciónDeDatos #SectorPúblico #RendiciónDeCuentas

---

## Nº 09 · Idea — El método, no un ranking

Imagen: `images/es/post-09.png`

> Construimos un modelo de eficiencia para nuestro ayuntamiento y decidimos no
> publicar un ranking.

Todo el mundo quiere una clasificación: «tu municipio es el 14.º más
eficiente». Es lo más compartible que puede publicar un proyecto cívico.

Construimos el modelo, un Análisis Envolvente de Datos (DEA) sobre los datos de
coste del Ministerio para municipios de tamaño parecido. Luego probamos
elecciones igual de defendibles sobre qué servicios comparar, y la puntuación
se movió por media escala.

Una cifra que cambia tanto según nuestras propias decisiones describe más
nuestras decisiones que el municipio. Publicarla como veredicto sería
deshonesto, por bien que luciera.

**Qué hace CivicPulse en su lugar:**

- Publica **el método completo**, para que cualquiera pueda rehacer la tabla
- Publica **las especificaciones fallidas como fallidas**: dos de nuestras
  cuatro no tenían suficientes municipios comparables, y están en la página con
  el motivo
- **Nunca nombra a otro municipio** que no tiene derecho de réplica en nuestra
  web
- **Nunca convierte la salida de un modelo en un hallazgo.** El veredicto de un
  modelo es nuestro, no del Ministerio

No puntuar no es timidez. Es la única versión de esto que creo que se sostiene.

#CienciaDeDatos #Estadística #IAResponsable #PolíticasPúblicas #Ética

---

## Nº 10 · Idea — La máquina retira, la persona publica

Imagen: `images/es/post-10.png`

> En nuestra web una máquina puede retirar una afirmación, pero solo una
> persona puede publicarla.

CivicPulse usa IA para transcribir los plenos, extraer afirmaciones, detectar
contradicciones y sugerir cuándo una promesa electoral puede haberse cumplido.
Es un trabajo útil, y también es donde un proyecto cívico puede convertirse sin
hacer ruido en una máquina de difamar.

Por eso las reglas están en la arquitectura:

1️⃣ Lo que produce la máquina va a un **archivo aparte**, marcado
`requiresHumanApproval`, y el esquema de lo publicado rechaza ese campo.
2️⃣ Una **comprobación de citas** bloquea la publicación si falta la fuente, la
cita no es literal o el enlace está muerto.
3️⃣ Firma un **curador humano**. La atribución se queda en el grupo político
salvo que se verifique a la persona concreta.
4️⃣ Todo lo publicado lleva **derecho de réplica**, y cada corrección es un
commit público en git.

Y la clave: **un veredicto automático solo puede bajar.** Puede retirar una
afirmación, pero nunca ascenderla. Una opinión nunca se marca como
«verificada». Se marca como «sin datos».

La IA puede acelerar el trabajo, pero la responsabilidad la tiene una persona.

#IAResponsable #ÉticaIA #Periodismo #TecnologíaCívica #Confianza

---

## Nº 11 · Ingeniería — Verde no es correcto

Imagen: `images/es/post-11.png`

> Dos de nuestras baterías de tests estaban en verde, y ninguna medía nada.

1️⃣ Nuestra comprobación de accesibilidad daba **cero infracciones de
contraste**. Resultó que la regla había evaluado **cero elementos**, porque las
teselas del mapa impedían detectar el fondo. No encontraba nada porque no
miraba nada.

2️⃣ Nuestro test de diseño móvil comprobaba que nada se desbordaba a 375px.
Pasaba **gracias** al mismo fallo de recorte que tenía que detectar.

Los dos estuvieron en verde durante semanas.

**Qué cambió en CivicPulse:**

- Cada comprobación debe demostrar ahora que **evaluó algo**, no solo que no
  encontró nada
- Cada comprobación de valores permitidos va con un techo para el valor por
  defecto («desconocido» debe quedar por debajo del 10 %). Una lista copiada a
  mano hizo desaparecer 53,5 M€ en contratos mientras el test seguía en verde
- **Ningún cambio visual está terminado hasta que una persona lo ha mirado en
  un navegador**, en modo oscuro y a 375px. Los tests comprueban datos y textos,
  y no pueden ver un diseño

Para una web cuya promesa es la exactitud, «los tests pasan» y «la página está
bien» son afirmaciones distintas.

El proyecto es de código abierto (AGPL-3.0). Enlace en el primer comentario.

#Testing #QA #Accesibilidad #DesarrolloWeb #CódigoAbierto

---

## Nº 12 · Idea — Mayo de 2027

Imagen: `images/es/post-12.png`

> En mayo de 2027, 8.131 ayuntamientos se presentan ante las urnas. Solo uno
> está radiografiado así de punta a punta.

Todo votante debería poder decidir con hechos, no con discursos de campaña.
Debería poder ver qué hizo su ayuntamiento, cuánto costó, qué se prometió y qué
dice el registro.

Riba-roja de Túria es donde hemos ido a fondo: presupuesto, contratos, coste de
los servicios, votaciones del pleno, promesas, quejas vecinales con sus plazos
legales y quién ocupa cada cargo. Cada cifra está citada, y hay derecho de
réplica en cada afirmación.

La capa nacional (presupuestos, coste efectivo de los servicios, contratos,
subvenciones, padrón, paro, boletines oficiales) ya está indexada por código de
municipio para **todos los municipios de España**. Escalarla es ingeniería, no
investigación.

**Cómo está planteado CivicPulse:**

- Sin anuncios, sin inversores, sin dinero de ningún gobierno al que vigila
- Código abierto (AGPL-3.0). Haz un fork, ponlo en marcha en tu municipio o
  dinos dónde se acaban nuestros datos
- Un responsable con nombre en la web, una metodología publicada y un registro
  público de cada corrección

Si trabajas en tecnología cívica, periodismo de datos, administración pública
o datos abiertos, y sobre todo si vives en uno de los otros 8.130 municipios,
me gustaría hablar contigo.

Primer comentario: civicpulse.es · github.com/datarhan/civicpulse

#TecnologíaCívica #Municipales2027 #CódigoAbierto #Democracia #DatosAbiertos #España
