# Atribución firmada: re-etiquetar el grupo de una declaración con prueba

_Diseño, 2026-10-04. Aprobado por el operador a través de la sesión coordinadora
(las cinco decisiones del final). Las cifras son las medidas ese día sobre main
aa52a047 y no se actualizan._

## Por qué

La PR #218 llevó al registro de declaraciones las correcciones de atribución que
firma la bitácora de /hallazgos. Siete de ellas no retiraban un grupo: lo
CAMBIABAN, con prueba —el segundo de la grabación y la frase con que la
presidencia dio la palabra—. La única CLI que toca `claim.speakerGroup`,
`retract-attribution`, sólo sabe escribir `null`, y por contrato: escribir un grupo
es una afirmación nueva sobre alguien. Así que las siete declaraciones quedaron
«sin atribuir» mientras su ficha dice el grupo correcto.

Escribir el grupo en la base no sirve. La base es gitignorada y reproducible: una
re-extracción la rehace; no guarda quién firmó ni por qué; y `carry:attribution`
no distingue una firma de una adivinanza (472064bd es esa confusión, y #218 la
pagó retirando 1.007 etiquetas). La prueba de corpus de #218 lo dejó escrito: «El
día que exista la firma, esta prueba tendrá que leerla en vez de ensancharse a
mano».

## Lo medido

- Las siete están a `null` en el monolito y en las sugerencias. Tres se sirven
  (10yl550-254-cit-cb6e5f, 19gax3o-139-cit-be1832, qz6weg-039-cit-bef239); cuatro
  son acusaciones que la puerta retiene.
- Las filas de la bitácora que las re-etiquetaron las firma `civicpulse-curator`,
  la cuenta de rol, que `rechazoDeFirma` no acepta como persona. Cada declaración
  la firma una persona de nuevo; no se hereda la firma de la ficha.
- qz6weg no tiene mapa de voces, y /metodologia publica «sin mapa, sin grupo».
  En las otras seis el mapa no da grupo (`sin-sosten`); ninguna lo contradice.
- Los segundos de la bitácora contienen las palabras de cada declaración
  (`quoteAppearsIn`): dos en la transcripción vigente y cinco sólo en la
  sustituida, cuyas líneas son tramos de 30 s sin hablante. `parseDiarizedTranscript`
  no las lee; `parseTimestampedSegments` (quote-reanchor.ts) sí.
- Ninguna declaración del monolito lleva `speakerSlug`.

## Decisión: un quinto estrato

`public/data/pleno-claim-relabels.json`, que sólo escribe
`npm run relabel-attribution`, y que `mergeVerified` aplica después de las
reclasificaciones y los reanclajes. Cada estrato manda sobre un campo: el overlay
sobre el veredicto, las reclasificaciones sobre el tipo, los reanclajes sobre el
literal y éste sobre `speakerGroup`. Se componen; ninguno deshace a otro.

Descartadas:

- **`retract-attribution --a <grupo>`**: rompe el contrato de la herramienta
  («sólo baja»), escribe en la base que una re-extracción borra, no guarda firma
  en los datos y `carry:attribution` no la distinguiría de una adivinanza.
- **Derivarlo de la bitácora de /hallazgos**: sus firmas son de la cuenta de rol,
  sólo alcanza a las declaraciones que una ficha cita, ata dos ficheros curados y
  el texto de la cita no es el literal de la declaración.

## La entrada

```json
"qz6weg-039-cit-bef239": {
  "speakerGroup": "PSOE",
  "from": null,
  "literal": "literal firmado · sha256:<12 hex>",
  "segundos": { "desde": 4016, "hasta": 4095 },
  "fuente": "superseded/qz6weg.txt",
  "reason": "…cómo se sabe quién habla, con su segundo…",
  "editor": "Nombre Apellido",
  "appliedAt": "2026-10-…"
}
```

- `from`: el grupo que decía la BASE al firmar. Si la base se mueve, la entrada
  queda obsoleta.
- `literal`: la huella del literal de la base, con la receta de las de
  pleno-finding.ts. El texto no se guarda: el fichero se sirve y cuatro de las
  siete son acusaciones retenidas. Si el literal cambia bajo el mismo id, la
  firma era sobre otras palabras: también queda obsoleta.
- `segundos` y `fuente`: el tramo escuchado y la transcripción donde la CLI
  encontró dentro de él las palabras de la declaración.

## Puertas

Al escribir (CLI) y al leer (cada recomposición):

- **Firma de una persona** (`rechazoDeFirma`): ni la cuenta de rol, ni un
  modelo, ni el hueco de una orden sin rellenar.
- **Sólo grupos con varios escaños**, derivados de `officials.json` (hoy PSOE y
  PP). Un grupo de un escaño nombra a su concejal por eliminación: nivel C, se
  rechaza. Uno sin escaños no lo ocupa nadie: se rechaza. Sin composición, falla
  cerrado. Un `from` de un escaño también se rechaza: el fichero se sirve y
  emparejaría la declaración con ese grupo; se retira antes con
  `retract-attribution`.
- **El tramo contiene las palabras** de la declaración en alguna transcripción de
  la sesión (vigente o sustituida). Al leer, si ya no las contiene, la entrada
  queda obsoleta en vez de aplicarse.
- **El motivo**: ≥20 caracteres, sin charla de la tarea, sin reimprimir el
  literal (ventana de seis palabras, como la retirada) y sin nombrar un grupo de
  un escaño (`findPartiesInText`).
- **Sólo la CLI**: no firma con la suspensión electoral activa (`frozenUntil`);
  retirar una entrada sí se puede. Exige que lo publicado sea la composición de la
  base en disco (`cotejarCompose` = `coincide`) y que recomponer cambie sólo la
  declaración firmada; `--dry-run` enseña la entrada y ese alcance.
- `--retirar <id>` quita una entrada, con motivo y firma de persona. Es la única
  salida: el gancho de ficheros curados deniega editarlo a mano.

## Composición

La entrada se aplica mientras la base diga `from` y el literal de la base
coincida con la huella: la declaración publica el grupo firmado y la marca
`atribucionFirmada: { desde, hasta }`.

Si la base se movió, el literal cambió o el tramo ya no contiene las palabras, la
entrada es **obsoleta**, y una obsoleta **nunca publica un grupo que contradiga la
firma**: si la base ya dice el grupo firmado, se queda; si dice otro o ninguno,
la declaración sale sin grupo. Es una bajada, de las que corren sin nadie
(nivel A). Tres desenlaces contados aparte en cada recomposición: aplicada,
obsoleta (con su porqué) y sin declaración.

## Alrededor

- `carry:attribution` salta las declaraciones con marca, con su propio motivo
  (`firmada`): copiar el grupo firmado a la base dejaría la entrada obsoleta y la
  etiqueta sin firma.
- `retract-attribution` se niega a retirar una declaración con firma (poner `null`
  en la base no la retira: la siguiente recomposición la vuelve a aplicar) y
  remite a `relabel-attribution --retirar`.
- `check:claim-provenance` tiene un desenlace `firmada` que no bloquea y que
  enseña lo que dice el mapa; `--from-check` nunca la lista.
- La prueba de corpus lee la firma: un grupo en una sesión sin mapa sólo cabe con
  firma aplicada; el fichero no lleva ningún grupo de un escaño; y una entrada no
  contradice el re-etiquetado firmado de la ficha que cita su declaración.
- `CURATED` y `docs/DATA_SOURCES.md`, el barrido de firmas, el grafo de datos.
- /declaraciones y /plenos/:id escriben «firmado» junto al grupo, con los
  segundos en el título.
- /metodologia describe la vía (sección de verificación de declaraciones) y deja
  de decir que el registro «todavía no tiene esa firma».

## Lo que no hace

- No firma retiradas: poner un grupo a `null` sigue siendo `retract-attribution`.
- No nombra a nadie ni toca `speakerSlug` (rechaza una declaración que lo lleve),
  el overlay o los ficheros de la auto-curación.
- No re-escucha nada: la persona firma lo que oyó; la CLI comprueba que sus
  segundos contienen la declaración, no quién habla en ellos.

## Las siete

Fuera de esta PR. Van como órdenes «Para firmar», con los motivos en ficheros,
los segundos también en h:mm:ss para cotejarlos con el vídeo y el hueco
`--editor "<nombre y apellidos>"`, que la CLI rechaza sin rellenar. Ensayadas en
una copia de usar y tirar; las firma el operador cuando el código esté en main.
Previsión: seis a PSOE y una (ea9d47) a PP; tres de ellas servidas.

## Decisiones del operador

1. Quinto estrato con su CLI (no `retract-attribution --a`, no derivarlo de la
   bitácora).
2. Una obsoleta nunca publica un grupo que contradiga la firma.
3. Sólo grupos con varios escaños; uno de un escaño o sin escaños, rechazado.
4. Marca «firmado», con los segundos, en /declaraciones y /plenos/:id.
5. Con `frozenUntil` activo no se firman entradas nuevas; retirarlas, sí.
