# Explicación firmada: una persona reescribe la explicación de una retractación del motor

_Diseño, 2026-10-06; decidido por el operador el 2026-10-10 a través de la sesión
coordinadora «Open session management and archival». Las cifras son las medidas el
06-10-2026 sobre main dcacb5ec y no se actualizan._

## Por qué

Una retractación del motor (`verdict-engine`, siempre `sin-datos`) publica bajo la cita
la explicación que guardó el motor. En cuatro de ellas —19gax3o-143, 1sqj7is-081,
ma87e0-195 y qz6weg-184— esa explicación es un parte del modelo sobre su tarea, y la
tarjeta dice «Explicación retirada» (`src/lib/resumenes-retirados.js`). La lectura del
06-10-2026 (`editorial/apartadas-249/` del checkout principal) dejó escrita, desde los
registros, la explicación honesta de cada una, y la de 1sqj7is-065 en
`editorial/recorte-8-y-7f7619/`.

Ninguna vía podía escribirla:

- `downgrade-verdict` baja contra lo publicado, y `sin-datos → sin-datos` no es una
  bajada;
- su `--amend-reason` (#183) sólo aceptaba entradas `curator-downgrade`;
- `subir-veredicto` sólo sube.

## Decisión: `--amend-reason` acepta también una retractación del motor

La misma orden de siempre, sin comando nuevo y sin etapa nueva en el trinquete, porque el
veredicto no se mueve:

```
npm run downgrade-verdict -- <id> sin-datos --amend-reason --new "<explicación>" \
    --reason "<por qué se enmienda>" --editor "<Nombre Apellido>" [--dry-run]
```

### La entrada

La enmienda vive en la entrada del motor, con la forma y la receta de #183
(`reasonAmendments`: huella de lo anterior, porqué, firma y fecha). Se diferencia en una cosa:
lo que se enmienda es **`verification.summary`**, la explicación que la tarjeta imprime.

- **Lo que se queda.** El `reason` del motor («verdict-engine (claude-code) re-judged
  parcial→sin-datos: …»), su `editor`, su `appliedAt` y sus `labelCorrections`. La decisión
  sigue siendo del motor, con su propio registro.
- **Por qué no se toca el `reason`.** Escribir ahí las palabras de la persona se las
  atribuiría al motor.
- **La huella.** `previous` es la de la explicación anterior.
- **El orden de las claves.** No cambia: la enmienda se añade al final de la entrada.

### Puertas

**Al escribir** (`enmendarMotivoDeBajada`):

- la entrada es una bajada de curador (como hasta hoy) o una retractación del motor en
  `sin-datos`; ninguna otra;
- la firma de una persona (`rechazoDeFirma`);
- la explicación:
  - tiene ≥20 caracteres y no habla de la tarea de un modelo;
  - no es la que hay;
  - **no es el texto de una máquina**: ni la del motor (tampoco dentro de otra, si es
    larga), ni la de la base, ni la propuesta de NLI, ni la familia del «no se encontró
    registro». Es `esTextoDeMaquina`, la regla de la subida firmada, trasladada a
    `claim-verdicts.ts` para que la usen las dos vías.

**Al leer** (`validateOverlay`):

- las enmiendas son de una bajada de curador o de una retractación del motor en
  `sin-datos`;
- cada una la firma una persona, en orden, y no antes de la entrada;
- la última cambió algo. En la del motor se compara con la explicación vigente; en la del
  curador, con su motivo, que es también su resumen.

**Lo que firmó una persona no lo reescribe una pasada.** La explicación sólo la sustituye
otra persona: otra enmienda, una subida firmada o una retirada.

- `applyOverlayEntries` rechaza una escritura del motor sobre una entrada enmendada, sea del
  motor o de un curador.
- `--ids` y `--recortar` la apartan, y el parte la cuenta aparte (DATA_INTEGRITY regla 2).
  La selección se mueve a `retractacionesDelMotor`, en decision-del-motor.ts, para poder
  probarla.
- `retirar-pasada --sin-juicio` no la devuelve. `decidirDevolucion` reconocía «la medida»
  por canal, rótulo y fecha, que una enmienda conserva, así que hasta hoy habría borrado la
  explicación firmada.

### La CLI, antes de escribir

Las comprobaciones de `subir-veredicto`, en un módulo que comparten las dos CLIs
(`scripts/lib/antes-de-firmar.ts`) para que no se separen. Para toda enmienda —la del
curador también, por decisión del operador—:

- la firma, antes de leer nada;
- con la suspensión electoral activa, no se enmienda nada;
- lo publicado es la composición de la base en disco (`cotejarCompose` = `coincide`);
- la declaración está en la base y en lo publicado;
- recomponer sólo cambia esta declaración.

Y, para la explicación de una retractación del motor:

- no es una acusación pública: subirla o explicarla sigue las reglas de /hallazgos;
- su literal consta en alguna transcripción de su sesión. Si no, la puerta la retiene, y una
  explicación no se leería en ninguna parte.

`--dry-run` enseña la entrada, la huella de lo que sustituye y lo que dirá la tarjeta. Si la
declaración está en `RESUMENES_RETIRADOS`, la orden recuerda que se quite de la lista en el
mismo commit.

## Lo que se publica

- `mergeVerified` estampa `reasonSignedBy` (la firma de la última enmienda) también en una
  retractación del motor.
- La tarjeta (/plenos/:id, /departamentos/:slug):
  - **la explicación** sustituye a «Explicación retirada…»;
  - **el veredicto:** «Veredicto: verificador LLM · explicación firmada por <Nombre
    Apellido>». El rótulo sólo se fía de la firma con el canal del motor y vuelve a mirar
    que nombre a una persona;
  - **las fuentes:** «Fuentes comprobadas: no constan» se queda, y es cierto: el motor no
    apuntó qué cotejó.
- /declaraciones no imprime la explicación, ni la línea de evidencia de una fila sin
  evidencia: no cambia.
- /metodologia («Motor de veredictos» y la enmienda de motivos) y /aviso-legal (la subida
  firmada y el periodo electoral) lo dicen en la misma PR.

## Lo que no hace

- No mueve ningún veredicto.
- No toca `checkedAgainst` ni la evidencia.
- No escribe en las entradas huérfanas: las 135 del overlay cuya declaración ya no está en la
  base (132 del motor, 3 de curador) se quedan como están, por decisión del operador.
  brxx5g-132 y -134 son dos de ellas.
- No firma nada: las órdenes van «Para firmar», con el hueco `<nombre y apellidos>`.

## Riesgo

- **Dos cosas ciertas, una al lado de la otra.** La explicación nombra registros mientras
  «Fuentes comprobadas» dice «no constan»: el motor no apuntó la lista, la persona sí los
  leyó. Declarar la lista en la enmienda queda fuera.
- **Una superficie legalmente material.** Es prosa sobre lo que dijo un cargo electo, y por
  eso la firma sólo una persona, y nunca durante el periodo electoral.

## Decisiones del operador (2026-10-10)

1. `--amend-reason` acepta la retractación del motor en `sin-datos`.
2. Las comprobaciones previas valen también para la enmienda del motivo de un curador
   (suspensión y composición).
3. Las huérfanas se quedan como están.
4. La tarjeta dice «explicación firmada por <Nombre>».
