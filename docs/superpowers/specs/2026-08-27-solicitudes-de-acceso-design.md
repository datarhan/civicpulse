# Solicitudes de acceso: convertir el hueco en una petición con reloj

_Diseño, 2026-08-27._

## Por qué

El dimensionado de la cobertura (`editorial/cobertura-sizing-etiquetado.md`)
salió al revés de lo que yo venía recomendando. De las 4.293 declaraciones que
no se pudieron cotejar contra ningún corpus:

| etiqueta             | muestra (n=102) |      |
| -------------------- | --------------: | ---: |
| `no-factual`         |              42 | 41 % |
| `sin-fuente-publica` |              26 | 26 % |
| `no-municipal`       |              17 | 17 % |
| `comprobable`        |              17 | 17 % |

Construir corpus tiene techo bajo: entre 405 y 1.025 filas, con un 95 % de
confianza. Lo grande —una cuarta parte— son **hechos municipales cuyo documento
probatorio no se publica**. Ningún corpus alcanza eso, y es exactamente lo que
`/laboratorio/cobertura` afirma en prosa sin haberlo medido nunca por dentro.

Este diseño convierte ese límite en una acción: pedir el documento, con el reloj
que la ley da, y publicar la respuesta o el silencio.

**Segunda medición, que reduce el alcance y hay que tenerla delante:** el 87,2 %
de esas filas **no nombra ningún documento**. Sólo ~548 lo nombran, y las dos
clases mayores —`contrato/concesión` (160) y `presupuesto/liquidación` (127)—
son cosas de las que YA tenemos corpus: ahí el hueco es de emparejamiento, no de
publicación. El objetivo real son cuatro clases y unas 233 filas:

| clase                   | filas |
| ----------------------- | ----: |
| informe técnico         |    91 |
| expediente              |    57 |
| plan interno            |    55 |
| acta / acuerdo plenario |    30 |

Cuatro cartas, no una cola de cientos. El sistema se dimensiona para eso.

## Qué NO es

- **No redacta la solicitud.** Una persona la escribe y una persona la presenta.
  Nada automático realiza un acto hacia fuera contra una administración.
- **No es una queja.** Una queja la pone un vecino sobre un servicio (LPACAP,
  tres meses, escala al Síndic). Una solicitud de acceso la ponemos nosotros
  sobre un documento (Ley 19/2013 art. 20, **un mes**, reclamación por el
  art. 24). Órganos y plazos distintos: no se mezclan.

  **Y el órgano es el Consell, no el CTBG.** Lo escribí al revés en el primer
  borrador. `src/scraper/consell-cv.ts` lo dice en su cabecera: el Consell de
  Transparència de la Comunitat Valenciana (CTIP-CV) resuelve las
  reclamaciones de los ayuntamientos valencianos, «which the national CTBG does
  NOT». Y se ve en los datos que ya raspamos: `ctbg.json` casa **0 de 11.003**
  resoluciones con Riba-roja, y `consell-cv.json` casa **2** (ambas de
  inadmisión, 2025-2026). Esas dos son además precedente: no es la primera vez
  que este Ayuntamiento es reclamado por acceso.

- **No promete que publicar un documento desbloquee N declaraciones.** Publicarlo
  es condición necesaria y no suficiente: alguien tiene que construir el lector.
  La página dice «91 dependían de esto», nunca «91 desbloqueadas».

## Arquitectura

Dos piezas, y **el corte entre ellas es la decisión de diseño**.

### 1 · El registro de solicitudes — CURADO

`public/data/solicitudes-acceso.json`. Se escribe SÓLO por CLI
(`solicitud:add`, `solicitud:responder`, `solicitud:reclamar`), nunca por
automatización. Entra en la lista de ficheros curados de `CLAUDE.md` y en
`.claude/hooks/guard-curated-writes.mjs`.

```
id            solicitud-2026-09-informe-tecnico
clase         informe-tecnico | expediente | plan-interno | acta
titulo        lo que se pidió, en palabras del solicitante
presentadaEl  YYYY-MM-DD
registro      nº de registro de la sede electrónica
respuesta     null | { fecha, sentido: concedido|parcial|denegado, url? }
reclamacion   null | { fecha, organo: consell-cv | ctbg, expediente?, resolucion? }
              (por defecto consell-cv: es el competente para un ayuntamiento valenciano)
```

Una persona la presenta y una persona anota la respuesta. Que lo escribiera una
máquina sería inventar un hecho sobre una administración pública.

### 2 · El paquete de evidencia — DERIVADO

Qué declaraciones dependen de cada clase, recalculado desde el corpus por un
clasificador léxico y publicado en el bloque `cobertura` del manifiesto de
trozos. Nunca escrito a mano, así que el recuento no puede separarse del corpus.

El clasificador vive en `src/scraper/clase-documental.ts`, con sus patrones
exportados y probados. Es **propiedad léxica, nunca un pronóstico**: mide qué
documento NOMBRA la frase y no afirma nada sobre si algo podría comprobarla. Una
frase que no nombra ninguno se cuenta aparte —son el 87 %— y no se reparte entre
las clases para que ninguna parezca mayor de lo que es.

La unión entre las dos piezas es `clase`.

## El reloj: cinco estados

| estado                  | significa                                      | sale      |
| ----------------------- | ---------------------------------------------- | --------- |
| `sin-solicitar`         | clase identificada, aún no pedida              | 0         |
| `en-plazo`              | presentada, dentro del mes (art. 20)           | 0         |
| `vencida-sin-respuesta` | pasó el mes y no contestaron                   | 0 · aviso |
| `respondida`            | concedido / parcial / denegado                 | 0         |
| `reclamada`             | art. 24, ante el Consell CV, con su expediente | 0         |

`sin-solicitar` existe por lo mismo que `sin-base` en `check:verified-compose`:
una clase que nadie ha pedido no puede pintarse como una que espera respuesta.
Doblar «no lo hemos pedido» dentro de «pendiente» es el defecto que este
repositorio ya ha pagado tres veces.

`vencida-sin-respuesta` dice **«no contestaron»**, no «denegado». El art. 20.4
convierte el silencio en negativo a efectos legales, pero la frase honesta es el
hecho, no la ficción jurídica. La consecuencia legal se explica al lado; no
sustituye a lo ocurrido.

Ningún estado sale 1: no hay avería que arreglar en que una administración
tarde. Lo que hay es una cola que tiene que verse.

## Superficie

Una tarjeta en `/laboratorio/cobertura`, bajo la declaración de universo. Cero
rutas nuevas: la página ya dice el problema —«el límite no es lo que sabemos
leer, es lo que no se publica»— y aquí dice qué se ha hecho con él.

Una fila por clase: clase · nº de declaraciones que dependen · estado · fecha ·
enlace a la resolución si la hay. Una clase en `sin-solicitar` se pinta como tal,
con su recuento, porque el hueco sin pedir también es información.

## Guardas

- **`check:solicitudes`** (en `monitor:health`): toda solicitud nombra una clase
  que existe en el paquete derivado; todo estado se deriva de las fechas y no se
  escribe a mano; una clase con declaraciones y sin solicitud se reporta como
  `sin-solicitar` y no se esconde. Imprime cuántas comprobaciones hizo.
- El fichero curado, en el hook de escritura y en la lista de `CLAUDE.md`.
- Una prueba fija que el estado nunca diga «denegado» por silencio.
- Una prueba fija que el clasificador no reparta entre clases la frase que no
  nombra ninguna.

## Verificación

- `npm test`, `typecheck`, `lint` limpios.
- Los cinco estados ejercitados, no sólo el verde, incluida la clase sin pedir.
- e2e de `/laboratorio/cobertura` + axe estricta + móvil 375 px.
- Mirado en navegador, claro y oscuro.
- El recuento de la página cuadra con el paquete derivado, recontado desde los
  trozos servidos.

## Fuera de alcance

- Redactar el escrito de solicitud.
- Presentar nada de forma automática.
- El 87 % que no nombra documento: es el bloque grande y necesita su propia
  medición antes de decidir qué le hace falta.
- Construir corpus para las clases donde ya lo tenemos (`contrato`,
  `presupuesto`): ahí el problema es el emparejador, no la publicación.
