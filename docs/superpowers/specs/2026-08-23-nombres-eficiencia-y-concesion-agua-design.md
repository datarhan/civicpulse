# Nombres en `/eficiencia` y la concesión del agua en el reportaje

**Fecha:** 2026-08-23 · **Estado:** diseño aprobado, pendiente de plan de implementación
**Superficies:** `/eficiencia`, `/gestion`, `/reportajes/coste-efectivo`

---

## 1 · El problema

El reportaje `coste-efectivo` es la pieza más corta de las cuatro (6,7 KB de
JSON congelado frente a 41 KB de `basuras`), y la brevedad no es su defecto
principal: **es una pieza sobre la declaración, no sobre el municipio.** Sus
tres secciones son tres defectos en cómo se rinde la cuenta. Un vecino que
entra queriendo saber cómo se gobierna su pueblo sale sabiendo cómo se
rellena un formulario del ministerio.

Al mismo tiempo, `/eficiencia` sí contesta «¿gastar más es bueno o malo?» —
`indicador-lectura.ts` lo tiene escrito, por escalón, y bien escrito — pero la
respuesta llega repartida en trece tarjetas, una por servicio, de modo que
nadie la lee entera. Y ninguna de las dos superficies dice **quién responde**
de cada servicio.

Falta además un hecho que estaba delante todo el tiempo: diez días antes de
que el reportaje se publicara, el ayuntamiento adjudicó la concesión del agua
por diecisiete años. La pieza no lo menciona.

## 2 · Qué se hace

Dos superficies, dos trabajos distintos:

|                          | `/eficiencia` + `/gestion`                                                  | `/reportajes/coste-efectivo`                   |
| ------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------- |
| Trabajo                  | El panel completo, con la lectura hecha legible                             | La historia, con un resumen del panel          |
| Nombra personas          | **Sí** — competencia delegada, congelada y firmada                          | **Sí** — igual, más cargos societarios         |
| Nombra empresas          | Sólo al concesionario, y sólo para explicar por qué su celda está en blanco | **Sí**, con la investigación societaria detrás |
| Emite hallazgos firmados | Sí, y siguen **sin nombrar a nadie**                                        | n/a                                            |

La última fila es la línea que sostiene todo lo demás y va explicada en §4.

## 3 · La capa de nombres

### 3.1 El peligro que define el diseño

`officials.json` **se raspa cada noche** (`nightly-scrape.yml` →
`scrape:officials`). Si la página dedujera el nombre en tiempo de render a
partir de ese fichero, un raspado nocturno podría **cambiar solo qué persona
viva aparece junto a una cifra de coste en una página publicada**. Eso es
exactamente «nada automático reescribe lo publicado», en su versión más
grave: automatismo reescribiendo el nombre de una persona.

De ahí la forma de toda la capa: **el mapa se congela y se firma; el raspado
se degrada a detector de deriva.**

### 3.2 `public/data/competencias.json` — curado, nunca automático

Fichero curado (entra en la lista de `docs/DATA_SOURCES.md` y en
`.claude/hooks/curated-paths.mjs`), escrito sólo por su CLI.

El bloque de abajo es **ilustrativo de la forma**, no un fichero a medio
rellenar: los guiones bajos marcan lo que sale del decreto de delegación
—expediente, fecha, URL y cita literal— que hay que ir a buscar (§6.3). El
validador rechaza el fichero si alguno de esos campos falta o va vacío, así
que un ejemplo sin rellenar no puede publicarse por descuido. La fecha de
constitución de la corporación se toma también del decreto, no de memoria.

```jsonc
{
  "mandato": { "id": "2023-2027", "desde": "2023-06-17", "hasta": null },
  "fuente": {
    "titulo": "Decreto de Alcaldía de delegación de competencias, mandato 2023-2027",
    "url": "https://www.ribarroja.es/...",
    "expediente": "____/2023/GEN",
    "fecha": "2023-06-__",
    "cita": "«…» — literal del decreto",
  },
  "asignaciones": [
    {
      "clave": "a1621", // id de SERVICIOS, o id de indicador municipal
      "cargo": "Servicios públicos municipales", // LITERAL de officials.json
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "editorial", // "literal" | "editorial"
      "razon": "El decreto no nombra la recogida de residuos; se le atribuye por ser el área de servicios públicos municipales.",
      "firmadoEl": "2026-08-__",
    },
  ],
  "sinAsignar": [
    { "clave": "a4411-440p", "motivo": "Ninguna área delegada nombra el transporte urbano." },
  ],
}
```

**`confianza` es el campo que hace honesta la tabla.** `literal` es cuando el
cargo nombra el servicio con sus propias palabras — _Cementerio_ → `a164`.
`editorial` es cuando el enlace lo ponemos nosotros — _Servicios públicos
municipales_ → recogida de residuos. Son dos cosas distintas, la ficha las
distingue en pantalla, y el validador exige `razon` siempre que sea
`editorial`.

**`sinAsignar` no es una lista de pendientes, es contenido.** Regla del
centinela: nombrar o devolver `null`, jamás adivinar. Un servicio sin cargo
identificable se publica como tal.

### 3.3 Las cuatro guardas

1. **Deriva, no propagación.** `check:competencias` comprueba que cada `cargo`
   aparece **literal** en `portfolios` del `oficial` correspondiente dentro del
   `officials.json` vivo. Si el raspado nocturno cambia una palabra, el check
   **se pone rojo y dice qué cambió**; nadie reescribe la página. Un humano
   re-firma por CLI. Cuatro desenlaces, como `check:eficiencia-findings`:
   `coincide` · `reformulado` (mismo cargo, otra redacción) · `desaparecido` ·
   `oficial-inexistente`. Los dos últimos salen con 1.
2. **Vigencia.** Ninguna asignación se pinta junto a un hecho fuera de su rango
   `desde`/`hasta`. Las series van de 2014 a 2024 y atraviesan tres
   corporaciones: la serie lleva su aviso y **el nombre no se extiende hacia
   atrás**.
3. **Congelación LOREG.** Con `frozenUntil` activo, la capa de nombres se
   oculta en las dos superficies. Mismo interruptor que ya gobierna
   `/promesas` (`npm run freeze:set`).
4. **Réplica nominal.** Cada persona nombrada tiene derecho de réplica propio,
   por la vía que ya existe: formulario de Issue → workflow de ingreso → CLI
   con validador → commit. Plantilla nueva
   `.github/ISSUE_TEMPLATE/competencia-response.yml`, hermana de
   `eficiencia-finding-response.yml`.

### 3.4 La frontera de la afirmación

Lo que la ficha dice:

> **Competencia delegada** · Servicios públicos municipales
> Rafael Gómez Sánchez (PSOE)

Eso es una **republicación de lo que el propio ayuntamiento publica** en su
portal de transparencia. Es orientación cívica: a quién se pregunta por esto.

Lo que la ficha **no** dice, y la guarda de prosa no deja escribir:
«responsable del sobrecoste», «su servicio es el más caro», ni ninguna
construcción que cuelgue el cociente de la persona. El aviso de escalón se
renderiza **en la misma tarjeta**, de modo que «81.964,66 €/efectivo» nunca
aparece junto a un nombre sin su «_es un precio y no un rendimiento_» al lado.

### 3.5 Nombrar no es reagrupar

`AREAS` sigue siendo funcional y las fichas siguen agrupadas por ella. La
competencia es **un campo de la ficha, no el criterio de ordenación**.
Reagrupar el panel por concejalía convertiría la página en un marcador de
personas, que es una afirmación distinta —y más fuerte— que «esto es quien
responde». El docblock de `indicador-registry.ts` que hoy prohíbe el mapeo se
reescribe para decir esto, no para borrarse: la razón por la que no se agrupa
sigue siendo válida aunque se nombre.

## 4 · `/eficiencia` y `/gestion`

1. **Bloque explicativo sobre las tarjetas**, que enseña los tres escalones una
   sola vez: qué divide cada uno y qué significa —y qué no— que su cifra sea
   alta. Construido desde `COMO_SE_LEE` y `GLOSA_TIER`, que ya existen, para
   que no pueda desviarse de lo que dicen las fichas.
2. **La dirección de lectura, explícita por ficha**: una línea derivada de
   `tier` + `percentil` que diga que más barato aquí puede significar menos
   servicio, y que la fuente no distingue las dos cosas.
3. **Las dos fichas bloqueadas se llenan.** Hoy `a161`/`a160` se leen como un
   fichero que falta. No lo es: el ayuntamiento no declara coste porque el
   vecino paga al concesionario. Eso es una ceguera estructural y merece su
   párrafo, con la concesión enlazada.

   La ficha **nombra al concesionario**, porque no se puede explicar por qué la
   celda está vacía sin decir a quién se le paga, y porque el concesionario ya
   figura entre los destinatarios institucionales del derecho de réplica de
   esta superficie. Lo que **no** entra aquí es la investigación societaria
   —grupo matriz, administradores, historial— que es trabajo de reportaje y
   vive en la pieza.

4. **La ficha de transporte** —un gasto real declarado con la casilla de
   viajeros a cero desde 2019, después de declararla llena hasta 2018— dice
   cómo se lee, en vez de quedarse como anomalía.
5. **La competencia delegada en cada ficha**, según §3.

**`eficiencia-finding.ts` no se toca.** Los hallazgos firmados siguen sin
campo para una persona y siguen rechazando los de `pleno-finding.ts`. La
distinción es deliberada: un hallazgo firmado es la afirmación jurídicamente
material; decir quién tiene la competencia es orientación. Mezclarlas quitaría
los dientes al esquema que impide colgar un coste unitario de un concejal.

## 5 · El reportaje

**Nuevo eje: la concesión.** Título de trabajo: «El panel se queda en blanco
donde está el dinero».

| §   | Contenido                | Cifras verificadas                                                                                                                                                                            |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | La concesión             | Siete años de expediente: anuncio 2019 → suspendido feb-2021 → sentencia abr-2026 → adjudicación **6-ago-2026** a **Hidraqua**, **55.685.178,79 €** hasta **2043**, 7 ofertas, sin formalizar |
| 02  | La tesis                 | `a161` y `a160` en blanco · `motivo: concesión`                                                                                                                                               |
| 03  | El mapa del dinero       | 68,4 % en 5 proveedores · 47,5 % licitador único (332/699) · 40,8 % sin llamada abierta (285/699)                                                                                             |
| 04  | Lo que el panel sí ve    | 13 servicios · colegios y policía en percentil 85 · transporte con 0 viajeros declarados desde 2019 · cada uno con su competencia delegada                                                    |
| 05  | Con pinzas               | 2020 sin rendir · 13/13 congelados frente a mediana 63,1 % · IPC 22,8 %                                                                                                                       |
| 06  | Lo que no dice + réplica | Nominal por persona nombrada                                                                                                                                                                  |

**Dos precisiones que una versión descuidada erraría**, y que son el corazón
de la pieza:

- 55.685.178,79 € es el **valor estimado del contrato a diecisiete años**, no
  un precio anual.
- En una concesión el dinero sale del **recibo del agua**, no del presupuesto
  municipal. Por eso el retorno ministerial está en blanco: el coste no cruza
  los libros del ayuntamiento. **El coste efectivo del agua en Riba-roja es,
  oficialmente, nada** — mientras los vecinos pagan ~55,7 M€ en diecisiete
  años.

La cautela de comparabilidad ya está escrita en `indicadores.json` y se cita
literal: una sola adjudicación supone el 45 % del importe del periodo, y las
concesiones se adjudican por todo su plazo de una vez.

## 6 · Lo que hay que ir a buscar antes de publicar

Nada de esto sale de los snapshots. Son tareas de reporterismo previas a la
publicación, no incógnitas de diseño.

1. ~~**Contrastar `46717` contra su permalink de PLACSP**~~ — **HECHO
   (23-ago-2026).** La ficha oficial confirma: estado **Adjudicada**,
   adjudicataria **Hidraqua Gestión Integral de Aguas de Levante, S.A.**,
   **55.685.178,79 €**, adjudicación **06/08/2026**, **7 licitadores**, y
   **ninguna entrada de formalización**. Y destapó dos cosas que el snapshot no
   contaba:
   - **El expediente tardó siete años.** Anuncio 23-abr-2019 · suspensión
     06-jun-2019 · dos recursos ante el **TACRC** 04-jul-2019 · levantamiento
     18-sep-2019 · apertura de ofertas 26-may-2020 · **suspensión 11-feb-2021**
     · **sentencia 28-abr-2026** —y las actas 1 a 11 de la mesa publicadas esa
     misma tarde, entre las 14:05 y las 14:17— · acta 12 el 30-jun-2026 ·
     adjudicación 06-ago-2026. **Cinco años y dos meses** entre la suspensión y
     la sentencia.
   - **`tenders.json` se contradice consigo mismo** y por poco publica un
     estado falso: el mismo expediente es `revoked` como licitación y `awarded`
     como contrato. Son 347 expedientes duplicados, 344 con estado divergente,
     y el adjudicatario aparece 318 veces en `contracts` y CERO en `tenders`.
     Fijado en `tests/tenders-colision-id.test.ts`.

   Lo que sigue SIN saberse, y no se afirma: qué alegaban los recursos, quién
   los interpuso y qué resolvió la sentencia. Eso pide las resoluciones.

2. **Identidad societaria de Hidraqua**: CIF, grupo matriz, administradores,
   vía BORME y registro mercantil. No se afirma el grupo de memoria.
3. **Decreto de delegación 2023-2027**, para que §3.2 cite el decreto y no una
   página raspada.
4. **Decreto de delegación 2019-2023**, _sólo si_ se quiere un nombre sobre
   2020 (ver §8).
5. **Tarifa vigente del agua** — lo que paga un vecino por m³. Es la cifra que
   hace que 55,7 M€ signifique algo en una cocina.
6. **Los tres contratos de emergencia DANA** con Hidraqua (25.005,38 € +
   22.539,91 € + 94.446,81 €), todos `negotiated_without_publicity` y con
   estado `revoked`: averiguar qué significa ese estado en este conjunto antes
   de publicarlo.

## 7 · Doctrina que cambia en el mismo PR

- `/metodologia` y `/aviso-legal`: nombrar personas en esta familia de
  superficies **es** un cambio del contrato editorial publicado.
- Docblocks que hoy prohíben esto y pasan a explicar la frontera nueva:
  `indicador-registry.ts` (`AREAS`), `Eficiencia.jsx`, `LecturaRapida.jsx`.
- `CLAUDE.md`: la frase «son las únicas que no nombran a **nadie**» deja de ser
  cierta y se sustituye por la frontera de §3.4.
- `docs/DATA_SOURCES.md`: `competencias.json` y su CLI.
- `npm run build:prose-map` regenerado.

## 8 · El agujero de 2020 se queda abierto

`officials.json` es la corporación 2023-2027 y no trae rangos de fechas;
`bop.json` tiene seis anuncios y ninguno es un decreto. Atribuir a quien hoy
tiene la competencia un incumplimiento de 2020 sería sencillamente falso, y es
la trampa del centinela `Otro` otra vez: nombrar por eliminación.

Por defecto, 2020 se cuenta **sin nombre**, diciendo que la corporación era
otra. Si se quiere nombre, se abre la tarea §6.4 y el nombre sale del decreto
de entonces o no sale.

## 9 · Pruebas y guardas

- `tests/parse-competencias.test.ts` — esquema, contra un fixture real; importa
  el tipo, no lo reescribe.
- `check:competencias` — deriva contra `officials.json` vivo, cuatro
  desenlaces, y **afirma que comprobó algo**: sale con 1 si recorrió cero
  asignaciones, para que un fichero vacío no imprima su propio visto bueno.
- **La frontera de §3.4 se vigila en dos capas, y sólo una es mecánica.**
  Mecánica: el esquema no tiene ningún campo donde quepa un juicio junto a una
  persona —`competencias.json` guarda cargo, nombre, partido, confianza y
  razón, y nada más— así que la prosa acusatoria no tiene dónde vivir en los
  datos. Humana: la prosa escrita a mano en los componentes y en el reportaje
  pasa por `revisar-borrador` frase a frase. No se finge que un regex distinga
  «tiene la competencia» de «es responsable del sobrecoste»; eso lo lee una
  persona.
- `tests/infografia-sync.test.js`: todas las cifras congeladas se mueven — la
  infografía se recorta o se retira; no puede quedarse afirmando las viejas.
- e2e: la capa de nombres desaparece con `frozenUntil` activo.
- `revisar-borrador`, frase a frase, antes de publicar.
- Revisión en navegador de las dos superficies, en claro, oscuro y a 375 px:
  las suites no ven una maqueta.

## 10 · Fuera de alcance

Nota global, media de percentiles o ranking: siguen prohibidos. La pieza es más
fuerte sin ellos — «el instrumento se queda ciego justo donde está el dinero»
es un hallazgo, y un marcador lo enterraría bajo una discusión de
ponderaciones.

Tampoco se reagrupan las fichas por concejalía (§3.5), ni se toca
`eficiencia-finding.ts` (§4).

## 11 · Esto no cabe en un solo plan

Son tres entregas, y el orden importa porque la segunda y la tercera dependen
de que la primera exista y esté firmada. Cada una es un PR revisable por su
cuenta:

**A · La capa de competencias.** `competencias.json`, su tipo, su CLI de firma,
`check:competencias`, el fixture y su test, la plantilla de réplica nominal, y
la congelación LOREG. **Sin UI**: al terminar, el fichero existe, está firmado
y validado, y ninguna página lo pinta todavía. Un PR que se puede revisar
preguntando sólo «¿puede esto nombrar mal a alguien?».
Requisito previo: el decreto de delegación (§6.3).

**B · Las dos superficies del panel.** Bloque explicativo de escalones,
dirección de lectura por ficha, las dos fichas bloqueadas, la ficha de
transporte, y la competencia delegada pintada en cada una. Cambios de doctrina
de §7 que afectan al panel. Revisión en navegador en claro, oscuro y 375 px.

**C · El reportaje.** Eje nuevo, seis secciones, cifras congeladas de nuevo,
infografía recortada o retirada, `/metodologia` y `/aviso-legal`.
**Es la entrega más lenta y no por el código**: depende entera del
reporterismo de §6, y §6.1 y §6.2 —contrastar el contrato y averiguar quién es
la empresa— no tienen atajo. Empezar por ahí.

Si en algún momento hay que elegir, **A y B valen por sí solas**: el panel con
la lectura legible y con quién responde de cada servicio ya contesta la
pregunta que originó todo esto. El reportaje es lo que la convierte en una
historia.
