# Reglas de integridad de datos

Escrito el 2026-08-02, después de una auditoría que encontró ~30 defectos reales
en todos los pipelines del proyecto. **Cada regla de aquí existe porque algo
concreto se rompió**, y cada una lleva el caso que la provocó. Sin el caso, una
regla es una opinión; con él, es un recordatorio de lo que cuesta ignorarla.

El sesgo de todo el documento: en un proyecto que publica afirmaciones sobre
cargos electos con nombre y apellidos, **una comprobación que no puede fallar es
peor que no tener comprobación**. La segunda deja ver el hueco; la primera lo
tapa con una luz verde.

---

## 1. Los catorce modos de fallo observados

Sirven como lista de repaso al escribir o revisar cualquier adaptador. No son
categorías teóricas: los catorce ocurrieron aquí.

| # | Modo | Caso real |
|---|---|---|
| 1 | **Vocabulario a la deriva** | El enum decía `finalized`; la fuente emite `formalized`. 298 contratos → `unknown`. **53,5 M€ desaparecidos.** |
| 2 | **Nombre de campo desalineado** | El verificador leía `award_amount_eur`, presente en 0 de 1.231 filas. El cruce entero no encontraba nada, y se publicaba «0% de verificación» junto a medios con nombre. |
| 3 | **Fixture con forma inventada** | 6 tests construían formas imposibles (`fingerprint: 'shared'`, `award_amount_eur`). Verdes mientras producción no casaba nada. |
| 4 | **Centinela publicado como dato** | `Otro` significaba «partido» y «no sé quién habla». Con un solo concejal debajo, nombraba a una persona por eliminación. |
| 5 | **Comprobación vacua** | El allow-set del enum incluía `unknown`, así que toda fila mal convertida caía en un valor permitido. La deriva era invisible por diseño. |
| 6 | **Cero contra ausente** | «0 votaciones» en 54 sesiones que nunca se transcribieron: afirmaba que un pleno no votó. |
| 7 | **No-op silencioso** | El motor de veredictos informó «re-juzgadas 1.017» con **cero llamadas al modelo**, en tres capas distintas. |
| 8 | **Rancio presentado como fresco** | El verificador re-sellaba `generatedAt` aunque la extracción hubiera fallado. El chip decía «hoy». |
| 9 | **Ruta de render huérfana** | UI para `contradicho` y `promesa-repetida`, ambos con 0 filas en todo el corpus. |
| 10 | **Punto ciego de coste** | La transcripción llamaba a la API con curl y no escribía telemetría: el panel decía $0 mientras se gastaba dinero, hasta que se agotó el saldo. |
| 11 | **Prosa desfasada** | Arreglar el dato no arregla las frases escritas sobre él. Cuatro textos publicados quedaron falsos el mismo día. |
| 12 | **Dirección asumida** | El motor se escribió para SUBIR veredictos; usarlo para BAJARLOS falló en silencio en tres capas que daban por hecho el otro sentido. |
| 13 | **Puerta de recuperación** | El LLM «no encontró nada» porque la recuperación no le dio candidatos. Indistinguible de estar de acuerdo. |
| 14 | **Solapamiento como prueba** | Una palabra compartida bastaba para «desmentir»: el alquiler de vivienda refutado por el alquiler de un camión de basura. |

---

## 2. La escalera de evaluación

Cinco niveles. Cada uno atrapa lo que el anterior no puede, y **el orden importa
por coste**: lo determinista antes que lo probabilístico, siempre.

### Nivel 0 · Que el fallo sea imposible

- **Exporta el enum, no lo reescribas.** Un test que copia el allow-set a mano
  prueba la copia, no la fuente. `CONTRACT_STATUS` se exporta y los tests lo
  importan.
- **Techo de fallback junto a todo enum.** El enum solo no basta: un valor no
  reconocido cae en `unknown`, que también está permitido. Añade siempre
  `unknown / total < 0.1`.
- **Un centinela nunca es un valor.** Si `Otro` puede significar «no lo sé», no
  puede significar también «este partido». Nombra la cosa o devuelve `null`.
- **Un centinela no se salva cambiando de campo.** `Otro` sobrevivió a la
  primera retirada en `votes[].bloc` con el argumento de que allí respondía a
  otra pregunta. No era cierto: las 12 filas llevaban `seats: 1` y nombraban al
  mismo concejal por eliminación, y el valor ni siquiera venía del acta — el
  extractor recibió la tabla de escaños de `officials.json` cuando aún decía
  `Otro` (`scripts/logs/vote-backfill.log`). Si un campo excluido del barrido
  contiene el centinela, el barrido no ha terminado; y el contador que decía
  «quedan N sin tocar, a propósito» imprimía N=0 porque nunca abría el fichero
  que los tenía.

### Nivel 1 · Que el test no pueda pasar en vano

- **Las fixtures importan la forma; no la restaten.** El defecto más repetido de
  la auditoría, seis veces.
- **Fixture = fila real.** Si la forma no existe en `public/data`, el test
  prueba ficción. Copia una fila y recórtala.
- **Toda referencia comprometida.** `.transcript-check-baseline.json` y
  `.vocabulary-census.json` van a git: con `.gitignore`, CI escribe una
  referencia nueva cada noche e informa «sin cambios» para siempre.

### Nivel 2 · Que la ejecución demuestre que hizo algo

- **Distingue «no hice nada» de «no había nada».** Todo trabajo por lotes
  informa: intentadas / juzgadas / **nunca intentadas** / saltadas con motivo.
  Sumar lo no intentado a «sin cambios» es lo que ocultó el no-op de 1.017.
- **Cero unidades procesadas = salida distinta de cero.** Si se recuperaron
  candidatos y no se emitió ni se descartó ninguno, el modelo no contestó: no es
  un día tranquilo.
- **Telemetría en toda llamada metered, sin excepción.** Incluido lo que sale por
  `curl` desde un script de shell.
- **Sin timeout no hay fallback.** Un CLI colgado bloqueó un lote 6,5 horas sin
  una línea de salida. Todo proceso hijo lleva perro guardián.

### Nivel 3 · Reconciliación entre fuentes

Comprobaciones que existen y corren en `scrape-all`:

| Comprobación | Qué caza |
|---|---|
| `check:relations` | claves foráneas rotas entre snapshots |
| `check:cadence` | datasets que dejaron de refrescarse en silencio |
| `check:corpus` | citas publicadas que su transcripción ya no respalda |
| `check:drift` | cifras publicadas que se separaron del dato vivo |
| `check:vocabulary` | vocabulario de origen que se movió bajo el parser |

### Nivel 4 · Evaluación adversarial

- **Conjunto de control con etiquetas humanas**, y un veredicto no se publica sin
  precisión medida. El determinista acierta 33% en `verificado`; el
  `sin-datos` del motor, 92%. Por eso el motor **solo retracta**.
- **Solo a la baja.** Un veredicto automático puede quitar una afirmación, nunca
  ponerla. Retirar una acusación mal fundada es seguro; añadirla no.
- **Cada cita, verificada literalmente contra su extracto.** Si el valor citado
  no aparece literal, se rechaza como alucinación.

### Nivel 5 · Puerta humana en el límite de difamación

Automatizable hasta aquí y **ni un paso más**:

- `contradicho` — el comparador emitió 49 y los 49 estaban mal.
- Atribución individual — `speakerGroup` es de bloque; nombrar a una persona lo
  promueve un curador.
- Publicar un hallazgo, una promesa o un reportaje.
- Editar texto ya publicado: solo por el flujo de correcciones, que deja
  constancia. **Nada automático reescribe prosa publicada.**

---

## 3. Al añadir un adaptador nuevo

1. Congela una carga real en `tests/fixtures/` — ése es el contrato (RED).
2. Escribe el parser puro; `fetch` solo en el CLI (GREEN).
3. **Exporta el enum e impórtalo en el test.** Añade el techo de fallback.
4. Ejecuta `npm run check:vocabulary -- --accept` y comitea el censo.
5. Declara su cadencia en `snapshot-cadence.ts`, o no se sabrá si deja de moverse.
6. Si CI no alcanza la fuente, va a `scrape-ci-blocked.sh` **y** a best-effort.
   Best-effort sin ruta local de refresco es decadencia silenciosa.
7. Si la superficie publica una cifra, ánclala en `check:drift`.

## 4. Al tocar un pipeline

- Actualiza `/metodologia`. Es el contrato editorial publicado, no marketing.
  Se quedó desfasado el mismo día que cambiaron cuatro pipelines.
- Pregunta qué prosa dependía de la cifra que acabas de mover. Cinco veces en un
  día, arreglar el dato dejó falso un texto publicado.
- Comprueba la dirección: ¿asume este código que los veredictos solo suben?

