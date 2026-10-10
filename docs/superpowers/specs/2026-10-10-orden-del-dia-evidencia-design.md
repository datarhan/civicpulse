# Un punto del orden del día como evidencia de una subida firmada

_Diseño, 2026-10-06; decidido por el operador el 2026-10-10 a través de la sesión
coordinadora «Open session management and archival». Las cifras son las medidas el
06-10-2026 sobre main y no se actualizan._

## Por qué

Una declaración sobre lo que se llevó a un pleno sólo la sostiene un orden del día o un acta,
y la subida firmada (`subir-veredicto`) sólo citaba contratos adjudicados y convocatorias de
la BDNS.

- **El caso.** 1sqj7is-081 (pleno del 09-03-2026): «ya comenté en el pleno pasado que
  trajimos Santa Rosa 2».
- **Lo que citó el motor.** Un contrato de 2018 sobre la misma unidad de ejecución: se le
  parece y no lo sostiene.
- **Lo que sí lo sostiene.** El orden del día de la sesión anterior, rx4hb4 del 09-02-2026,
  punto 2: «Expedient: 5543/2020/GEN, Acord relatiu al sotmetiment a informació pública de
  la versió inicial del PRI de la UE Santa Rosa 2».

**Actas no.** No hay corpus: `scripts/fetch-pleno-actas.ts` está roto contra el portal de
hoy y no hay ninguna en caché (docs/DATA_SOURCES.md). Esta vía cita el orden del día y nada
más.

## Decisión: el orden del día, por su enlace y su punto

```
npm run subir-veredicto -- <id> <parcial|verificado> \
    --evidencia '<enlace regmeet de la sesión>' --punto <n> \
    --resumen-de <fichero> --editor "<Nombre Apellido>" [--dry-run]
```

- **El registro.** `--evidencia` nombra la sesión por su enlace público, el de
  `plenos-agendas.json`: 62 sesiones, 2023-01-23 → 2026-09-07, 619 puntos, un enlace por
  sesión.
- **El punto.** `--punto` elige uno, como `--lote` elige el lote de un expediente. Sin él, la
  CLI enumera los puntos de la sesión.
- **El enlace.** Se compara sin la consulta (`?idioma=…`), y la fila guarda el del corpus.
- **Lo demás no cambia.** Las demás puertas de la subida firmada se quedan como están: firma
  de una persona, suspensión electoral, composición, alcance, transcripción, ninguna
  acusación, un resumen que escribe la persona.

### La fila la escribe el registro

```json
{
  "kind": "agenda",
  "ref": "<enlace de la sesión>",
  "stance": "checked",
  "snippet": "Orden del día del pleno ordinario del 09-02-2026 · parte resolutiva · punto 2: Expedient: 5543/2020/GEN, Acord relatiu al sotmetiment a informació pública de la versió inicial del PRI de la UE Santa Rosa 2"
}
```

- **El título.** Literal, en su lengua, y **entero**: hay puntos de hasta 888 caracteres, y
  107 de los 619 pasan de 200. El corte de 240 de una fila de contrato dejaría fuera las
  palabras del propio registro. Las filas de contrato y de la BDNS conservan su tope.
- **La parte.** La dice como la publica la convocatoria: parte resolutiva, de información y
  control, o ruegos y preguntas. Si no la dice, no la nombra.
- **Nunca «aprobado».** El resultado de la votación es otro registro, con otra procedencia:
  `pleno-votes.json` tiene «aprobado» para rx4hb4-02, de regmeet y `sin-verificar`.

### Clase nueva

- **La evidencia y el corpus.** `EVIDENCE_KINDS` gana `agenda`, `CORPUS_IDS` gana
  `plenos-agendas`, y `CORPUS_DE_KIND` lleva el uno al otro.
- **El validador.** La subida firmada (`validarSubida`) acepta `agenda`.
- **La tarjeta.** La fila sale con la etiqueta «ORDEN DEL DÍA», enlazada a la sesión, y
  «Fuentes comprobadas: plenos-agendas».

### Dos reglas sobre la declaración

- **La fecha.** La sesión del orden del día no puede ser posterior a la de la declaración. Un
  orden del día posterior no sostiene lo que se dijo antes; una promesa cumplida es otra
  afirmación (/promesas).
- **El importe.** Si la declaración trae una cifra (`entities.amountEuros`) y ninguna fila
  citada dice un importe, la subida no llega a `verificado`. `parcial` sí, y su resumen dice
  que la cifra no consta.
  - Un orden del día no dice importes, ni una convocatoria de la BDNS tal como se describe su
    fila. Sólo un contrato con importe lo dice.
  - La regla vale para toda subida, no sólo para el orden del día.

Las dos viven en una función pura, `comprobarRegistrosConLaDeclaracion`, que la CLI llama con
la fecha y el importe de la declaración publicada.

## /metodologia y /aviso-legal

- **/metodologia#subida-firmada.** La evidencia puede ser también un punto del orden del día de
  un pleno, tal como lo publica el Ayuntamiento. Establece que el asunto estaba en el orden del
  día de esa sesión, con ese título y en esa parte; no que se aprobara, ni una cifra, ni lo que
  se dijo en el debate. Y la regla del importe.
- **/aviso-legal «Con qué evidencia».** Lo mismo, en una frase.

## Riesgo

- **Llevarlo no es aprobarlo.** Un orden del día prueba que se llevó, no que se aprobara ni
  que una cifra sea cierta: de ahí la fila sin «aprobado» y la regla del importe.
- **«El pleno pasado».** Qué sesión es lo decide quien firma; el código sólo comprueba que no
  sea posterior.
- **El enlace de regmeet.** Responde 302 a sí mismo con `humano=si`. Un navegador lo sigue; un
  comprobador de enlaces sin cookies lo da por fallido (`regmeet-fetch.ts`).
- **Un orden del día puede cambiar.** Puede ganar asuntos de urgencia. La fila congela el
  título tal y como se firmó, y el cotejo de las cuatro salidas sigue pendiente, como para los
  contratos.

## Decisiones del operador (2026-10-10)

1. Evidencia del orden del día con `--punto`; el título entero; nunca «aprobado».
2. `verificado` permitido bajo la regla del importe.
3. Las actas, fuera mientras no haya corpus.
