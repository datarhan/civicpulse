# Subida firmada: una persona sube el veredicto de una declaración

_Diseño, 2026-10-04. La decisión de construir la vía y sus seis puntos mínimos son
del operador (a través de la sesión coordinadora «Open session management and
archival»), sobre la lectura de `editorial/rederivacion-0410-52/INFORME.md` §3. Lo
que este documento decide por su cuenta va al final, separado, para que se pueda
revisar. Las cifras son las medidas ese día sobre main 77f74f5f y no se actualizan._

## Por qué

Hasta hoy, en el registro de declaraciones, **un veredicto sólo baja**. El overlay
lo impone en `applyOverlayEntries`: «lo que bajó una retractación sólo lo vuelve a
subir una persona, por una vía que lo firme», y esa vía no existía. La única etapa
viva que sube, el anclaje NLI, sólo propone (`exigeFirma`), y su cola dice «Publicar
una subida pide una vía firmada por una persona, que hoy no existe».

La lectura del 04-10-2026 de las 52 declaraciones que el motor «ya no retractaría»
encontró ocho cuyo registro citado sí establece lo dicho: el contrato de esa misma
obra, una cifra que coincide al céntimo, la adjudicataria nombrada. Las ocho siguen
publicadas como `sin-datos` porque ninguna vía puede subirlas. Y no basta con
aceptar lo que dijo el motor: en dos de las ocho (k4olcs-018 y k4olcs-101) sus
anotaciones de evidencia contradicen al registro («el extracto no muestra el
importe 35.252,87», «no muestra adjudicatario Hidraqua»), y en 36 de las 52 su
propio razonamiento concluye que no hay respaldo mientras la extracción dice
`parcial`. Ni el razonamiento ni la extracción sustituyen a leer el registro.

## Lo medido

- Las ocho: base `sin-datos`, publicado `sin-datos`, y una entrada `verdict-engine`
  a `sin-datos` en el overlay. Ninguna es `acusacion_publica`; ninguna lleva
  `speakerGroup`. Lo publicado es la composición de la base (`cotejarCompose` =
  `coincide`).
- Seis citan un contrato de `tenders.json` y dos una convocatoria de `bdns.json`.
  De los contratos, todos están adjudicados o formalizados. Uno (c8kr44-081) cita un
  enlace de PLACSP que lleva a **dos** filas de `contracts`: los dos lotes del
  136/2025, Garbialdi y Auditesa. 66 enlaces de `tenders.json` llevan a más de un
  lote: el enlace solo no dice qué registro se cita.
- Tres de las ocho (19gax3o-034, c8kr44-081, c8kr44-142) tienen el resumen retirado
  por charla de la tarea (`src/lib/resumenes-retirados.js`). Firmar su subida cambia
  el resumen, y `tests/claim-ledger-resumen.test.jsx` pide entonces quitarlas de la
  lista en el mismo commit.
- El hueco de la orden preparada (`<nombre y apellidos>`) ya lo rechaza
  `rechazoDeFirma`.

## Decisión: una etapa nueva del trinquete, `curator-upgrade`

Vive en el overlay, que es el estrato dueño de los veredictos. No hay fichero
nuevo: la entrada sustituye a la que hubiera para esa declaración (su motivo y su
firma quedan en el historial del repositorio, como en una retirada).

```ts
'curator-upgrade': {
  nombre: 'Subida firmada',
  direccion: 'sube',
  puedeEmitir: ['verificado', 'parcial'],
  exigeCorpus: true,
  exigeRazon: true,
  exigeFirma: true,
  firmaEnLaEntrada: true,   // campo nuevo; ver abajo
  retirada: false,
  comando: 'npm run subir-veredicto',
  medicion: 'no se mide: …',
}
```

`exigeFirma` decía hasta hoy dos cosas a la vez, porque sólo había una etapa que la
llevaba: que lo emitido espera la firma de una persona, y que por eso la etapa no
escribe en el overlay. Con dos etapas que suben se separan: **`firmaEnLaEntrada`**
dice si la firma viaja en la propia entrada. NLI: `false` —sólo propone, su sitio es
la cola, y el overlay lo rechaza con firma y sin ella—. La subida firmada: `true`
—el overlay la acepta sólo si `editor` nombra a una persona (`rechazoDeFirma`)—. Una
fila de la cola de NLI firmada a mano sigue rechazada: su resumen y su evidencia son
los de la máquina.

### La entrada

```json
"k4olcs-018-afi-1077bc": {
  "verification": {
    "claimId": "k4olcs-018-afi-1077bc",
    "verdict": "verificado",
    "summary": "…lo escribe la persona, desde el registro…",
    "evidence": [
      {
        "kind": "tender",
        "ref": "https://contrataciondelestado.es/…idEvl=xkXNO23MYwoZDGvgaZEVxQ%3D%3D",
        "snippet": "Contrato mixto suministro y servicio de implantación de cartelería digital… · adjudicado a VODAFONE ESPANA SA por 35.252,87 € con IVA el 29-05-2024",
        "stance": "checked"
      }
    ],
    "checkedAgainst": ["tenders"],
    "derivedBy": ["curator-upgrade"]
  },
  "source": "curator-upgrade",
  "reason": "…el mismo texto que summary…",
  "editor": "Nombre Apellido",
  "appliedAt": "2026-10-…",
  "desde": "sin-datos"
}
```

- `desde`: el veredicto publicado al firmar. La subida corrige ESE estado: el
  overlay exige que sea el publicado y que volver a él sea una bajada
  (`isDowngrade(veredicto, desde)`). Es la relación de siempre, leída al revés, y no
  una escala nueva: de `sin-datos` a `parcial` o `verificado`, de `parcial` a
  `verificado`. Desde `contradicho` o `promesa-repetida` no se sube.
- `summary` = `reason`: la tarjeta imprime el resumen, así que el motivo que se
  firma es el que se publica (la misma regla que las enmiendas de una bajada).
- `checkedAgainst`: exactamente los corpus de los registros citados
  (`corpusDeEvidencia`), ni uno más. `derivedBy`: `['curator-upgrade']`.
- Cada fila de evidencia: `tender` o `bdns`, con enlace `http(s)`, sin `similarity`
  —no es una puntuación de parecido, y la tarjeta la imprimiría como si lo fuera—.

## Puertas

**Al escribir (`applyOverlayEntries`) y al leer (`validateOverlay`)**, para toda
entrada `curator-upgrade`:

- la firma de una persona (`rechazoDeFirma`): ni la cuenta de rol, ni un modelo, ni
  el hueco de una orden sin rellenar;
- el suelo de evidencia, como cualquier veredicto fuerte; motivo ≥20 caracteres
  igual al resumen, y sin charla de la tarea;
- `desde` coherente (arriba) y, al escribir, igual al veredicto publicado que pasa
  la CLI y al de la entrada que sustituye;
- ni `retirada` ni `reasonAmendments`: esas marcas son de una bajada.

**Lo que firmó una persona no lo pisa una pasada.** Una entrada `curator-upgrade`
sólo la sustituye una bajada de curador o otra subida firmada. El motor ya no la
elegiría —`--ids` sólo re-deriva sus propias retractaciones, `--base` salta lo que
tiene entrada, el modo normal sólo mira entradas `llm`—; esto lo sostiene en el
overlay si otro llamante no lo hiciera.

**Las acusaciones, nunca.** La CLI se niega con `acusacion_publica` (el tipo
publicado, reclasificación incluida) y la remite a las reglas de `/hallazgos`.
Componer también se niega si una entrada `curator-upgrade` cae sobre una acusación,
y el rebuild conserva su guarda de siempre (`acusacionesQueSuben`).

**Sólo la CLI**, `npm run subir-veredicto`, modelada en `relabel-attribution` (#229):

- la firma, antes de leer nada;
- con la suspensión electoral activa (`frozenUntil`) no sube nada; retirar, sí;
- lo publicado tiene que ser la composición de la base en disco
  (`cotejarCompose` = `coincide`), y recomponer sólo puede cambiar esta
  declaración;
- la declaración tiene que constar en alguna transcripción de su sesión: una cita
  `sin-rastro` la retiene la puerta, y subirla no publicaría nada que se pueda leer;
- `--dry-run` enseña la entrada, el registro de cada evidencia y lo que dirá la
  tarjeta, y no escribe nada;
- nunca corre sola: no la llama ningún runner, ningún cron ni ninguna nocturna.

### La evidencia la elige la persona

`--evidencia <enlace>` (repetible) nombra el registro por su enlace público, y la
CLI lo busca en el corpus: contratos de `tenders.json` (la fila de `contracts`, la
adjudicación) y convocatorias de `bdns.json` (por `sourceUrl`). Un enlace que no
está, se niega. Uno que lleva a varios lotes pide `--lote <n>` (`batchNumber`) y,
si falta, la CLI enumera los lotes con su adjudicataria e importe. Un contrato que
no está adjudicado ni formalizado (`isCommittedContract`) no se cita por esta vía:
la fila diría «adjudicado» de algo que no lo está.

El `snippet` lo escribe el código **desde el registro**, nunca quien firma:

- contrato: `título · lote N del 136/2025 · adjudicado a <adjudicataria> por
194.810,00 € con IVA el 10-09-2025` (el número de expediente sale de la fila de
  `tenders` con el mismo enlace; lote, adjudicataria y fecha, sólo si constan);
- BDNS: `descripción · convocatoria BDNS 752816 del 04-04-2024`.

El importe va con céntimos y su magnitud dicha («con IVA»), y nunca se corta: si
hace falta, se recorta el título para caber en los 240 caracteres de un snippet
publicado. Es lo que el informe §4.b echó en falta en las filas del motor, que
cortaban el importe y nunca llevaban la adjudicataria. Con céntimos,
`importeImpreso` no lee la fila y el «puente» de la tarjeta no se monta: no hay dos
cifras que cuadrar, porque la fila ya dice cuál es la suya.

### El resumen lo escribe la persona

`--resumen-de <fichero>` (o `--resumen "<texto>"`): ≥20 caracteres, sin charla de la
tarea, y **no el de ninguna máquina tal cual**. La CLI se niega a un resumen igual
—sin distinguir mayúsculas ni espacios— al publicado, al de la base, al motivo de la
entrada que sustituye, al de la sugerencia de NLI de esa declaración si la cola está
en disco, o a cualquiera de la familia del «no se encontró registro» del verificador.

El fichero existe por la terminal del operador: el bash 3.2 de macOS rompe
`$(cat <<…)` cuando el texto lleva paréntesis.

### La salida: `--retirar`

`--retirar <id> --motivo-de <fichero> --editor "<Nombre Apellido>"` deshace una
subida firmada **bajando** la declaración al `desde` que guardó la entrada, con una
bajada de curador firmada por una persona y su motivo como resumen. No borra la
entrada: si la borrara, la declaración volvería a la base, y la base puede estar
POR ENCIMA de lo que había antes de subir —si el motor la había retractado, borrar
la subida republicaría lo que el motor bajó sin que nadie lo firmara—. Se puede
retirar con la suspensión electoral activa.

## Composición y lo que se publica

`mergeVerified` estampa, como con el canal de toda entrada, `source:
'curator-upgrade'` y **`raisedBy`**: la firma de la entrada, que el validador exige
que nombre a una persona. Lo que una verificación trajera colado dentro con ese
nombre no se publica.

La puerta pública no cambia: la fila nombra un corpus real y trae evidencia, así
que sale `shown` como cualquier veredicto fundado.

**La tarjeta** (`etiquetaVerificador`, en /plenos/:id y /declaraciones): «subido por
una persona · firmado por <Nombre Apellido>». La pasada se declara en `PASADAS`, con
una clase nueva en `CLASE_DE_PASADA`: `persona`. Sólo se fía de lo que estampa la
composición: sin `source: 'curator-upgrade'` o sin una firma de persona en
`raisedBy`, dice «subido; no consta quién lo firmó». La línea «Fuentes comprobadas»
lista los corpus de los registros citados.

## Las guardas que la leen

- **`check:veredictos`**, primer cotejo: dos desenlaces nuevos. `subido` (sale 0) —la
  subió una persona, nombra corpus y trae evidencia—; y `sin-firma` (sale 1) —una
  fila que dice ser una subida, por su canal o por su `derivedBy`, sin una persona en
  `raisedBy`: eso lo ha roto alguien hoy—. Una subida sin corpus o sin evidencia sale
  `sin-corpus`, como cualquier otra.
- **`check:veredictos`**, cotejo con la base (`overlayOutcomes`, #226): una subida
  firmada por encima de su base no es `por-encima` —ese desenlace dice que nadie ha
  decidido— sino un quinto desenlace, `subidasFirmadas`, que se lista y sale 0. Se
  reconoce por el canal y por la firma de persona del `editor`; una entrada
  `curator-upgrade` sin ella seguiría siendo `por-encima`. El rebuild deja de
  avisar por ellas.
- **`check:claim-provenance`** no lee veredictos, y la subida no toca la
  declaración: la composición la deja intacta (misma referencia), así que sus
  desenlaces no cambian. La CLI, además, no sube una cita sin procedencia.
- **Corpus**: las pruebas que recorren `PASADAS` y las claves de `TRINQUETE` la
  recogen solas; la de `/metodologia` comprueba la fila nueva.

## Alrededor

- `CURATED` y `docs/DATA_SOURCES.md`: `subir-veredicto` entre las CLIs del overlay y
  del monolito. No hay fichero nuevo.
- El comentario de la cola de NLI deja de decir que la vía «hoy no existe»: la
  subida la firma una persona con `subir-veredicto`, con su registro y su resumen.
- `/metodologia`: la subida firmada, en la verificación de declaraciones y en el
  trinquete («lo que una retractación bajó no lo vuelve a subir ninguna escritura
  automática; sólo una persona, con su nombre»). `/aviso-legal`: qué afirma un
  veredicto subido, quién lo firma, con qué evidencia, y que lo automático sigue
  bajando sólo.
- `CLAUDE.md` no se toca: lo cambia el operador.

## Lo que no hace

- No sube acusaciones, ni `contradicho`, ni cita registros que no sean un contrato
  adjudicado o una convocatoria de la BDNS (licitaciones en curso, presupuesto,
  promesas: cada uno pediría su descripción del registro, en su PR).
- No firma nada: la CLI la ejecuta una persona.
- No vuelve a cotejar el registro citado si cambia después en el corpus. La fila
  queda congelada tal y como se firmó; un cotejo de las cuatro salidas
  (`coincide`/`movido`/`contradice`/`sin-registro`, como `check:eficiencia-findings`)
  queda para otra PR.

## Las ocho

Fuera de esta PR. Van como órdenes «Para firmar», con los resúmenes en ficheros
(escritos desde el registro, informe §3), y el hueco
`--editor "<nombre y apellidos>"`, que la CLI rechaza sin rellenar. Ensayadas en una
copia de usar y tirar; las firma el operador cuando el código esté en main.

## Decisiones

Del operador (04-10-2026):

1. Una etapa nueva del trinquete que sube, emite `verificado`/`parcial`, exige
   corpus y motivo, y el overlay la acepta sólo con la firma de una persona; la CLI,
   modelada en `relabel-attribution`.
2. La evidencia la elige la persona (un enlace que exista en el corpus) y el resumen
   lo escribe ella; nunca la verificación del motor tal cual.
3. Nunca una `acusacion_publica`.
4. `check:veredictos` reconoce la firma; `check:claim-provenance` y las guardas de
   corpus no la malinterpretan; la tarjeta dice que la subió una persona.
5. `CURATED` y `docs/DATA_SOURCES.md`; `CLAUDE.md`, para el operador.
6. `/metodologia` y `/aviso-legal` en la misma PR.

Tomadas en esta PR, para revisar:

- `firmaEnLaEntrada` en `Etapa`, en vez de una excepción por nombre de etapa.
- `desde` en la entrada, y la subida como «volver sería una bajada».
- `--retirar` baja a `desde` con una bajada firmada, en vez de borrar la entrada.
- Una subida firmada sólo la sustituye una bajada de curador u otra subida firmada.
- El snippet con importe en céntimos, magnitud dicha y adjudicataria; el título se
  recorta, el importe no.
- Sólo contratos adjudicados o formalizados y convocatorias de la BDNS.
- La tarjeta imprime el nombre de quien firma (como «motivo firmado por…»).
- `subido` y `sin-firma` en `check:veredictos`; `subidasFirmadas` en
  `overlayOutcomes`.
- La CLI no sube una cita `sin-rastro`.
