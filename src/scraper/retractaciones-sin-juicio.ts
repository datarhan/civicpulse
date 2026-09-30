/**
 * Retractaciones del motor que el modelo nunca vio.
 *
 * La pasada del 24-06-2026 (`verify:pleno-claims:engine`, gpt-5.4-mini, shortlist
 * léxica) volvió a juzgar los veredictos que la segunda pasada LLM había subido a
 * verificado/parcial. A las declaraciones sin un solo candidato el verificador
 * las devolvía sin preguntar al modelo, con el veredicto del determinista
 * —`sin-datos`—, y el guion lo leía antes de mirar si había habido juicio: las
 * escribió como «verdict-engine re-judged verificado→sin-datos». La tarjeta dice
 * desde entonces «Veredicto: verificador LLM» sobre algo que ningún modelo leyó
 * (DATA_INTEGRITY, regla 2). El guion ya no lo hace (decision-del-motor.ts).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO SE MIDIÓ (29-09-2026)
 *
 * No se puede derivar de lo publicado: las 301 entradas del motor que llevan
 * por resumen la frase fija del determinista (`RESUMEN_SIN_REGISTRO_FIJO`, en
 * claim-verdicts.ts) tienen todas la misma forma, juzgadas o no, porque ese
 * modo de la pasada tiraba también el razonamiento de las que el modelo sí
 * juzgó. Lo que las separa está en la
 * caché LLM del checkout principal (`.llm-cache/`, fuera del repositorio): para
 * cada id, la llamada `engine-reason-v1` con la clave de `callLLM`, validada con
 * `llmCacheHas`, y la hora de esa llamada contra el `appliedAt` de la entrada.
 *
 *   · 43 no tienen llamada al modelo, con ningún backend.
 *   · 4 la tienen de las 10:38, veinte minutos DESPUÉS de escribirse la entrada
 *     (10:14–10:17): la pasada que las retractó no llegó al modelo.
 *
 * Contraste: con la shortlist léxica de hoy, 38 de estas 47 no tienen ningún
 * candidato; de las 223 entradas que sí tienen su juicio en la caché, 221 los
 * tienen. En las 47, la base dice `sin-datos`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ SE HACE CON ELLAS
 *
 * `npm run retirar-pasada -- --sin-juicio` quita su entrada del overlay y aflora
 * el veredicto de la base, como habría pasado si el motor las hubiera saltado
 * (la pasada LLM que las subió está retirada). `decidirDevolucion` sólo toca la
 * entrada tal como se midió —misma fecha, mismo editor— y nunca si la base diría
 * más que `sin-datos`. Reescribe un fichero curado: lo firma el operador.
 *
 * La lista se queda después: es el registro de qué se devolvió y por qué, y la
 * orden se salta lo que ya no está. Una id se quita a mano sólo si otra pasada o
 * un curador vuelven a escribir su entrada y esa decisión debe mandar.
 */

const GPT = 'verdict-engine:gpt-5.4-mini'

export interface MedidaSinJuicio {
  /** El `editor` de la entrada cuando se midió. */
  editor: string
  /** Su `appliedAt`: la entrada es ésta y no una escrita después. */
  appliedAt: string
}

export const RETRACTACIONES_SIN_JUICIO: Readonly<Record<string, MedidaSinJuicio>> = Object.freeze({
  '19gax3o-049-cit-ea1202': { editor: GPT, appliedAt: '2026-06-24T10:17:28.958Z' },
  '19gax3o-137-afi-2af3a2': { editor: GPT, appliedAt: '2026-06-24T10:17:28.958Z' }, // su llamada es de las 10:38, posterior a la entrada
  '19gax3o-143-afi-66333d': { editor: GPT, appliedAt: '2026-06-24T10:17:28.958Z' }, // su llamada es de las 10:38, posterior a la entrada
  '19gax3o-151-afi-de1a33': { editor: GPT, appliedAt: '2026-06-24T10:17:28.958Z' }, // su llamada es de las 10:38, posterior a la entrada
  '19gax3o-170-pro-849d7e': { editor: GPT, appliedAt: '2026-06-24T10:17:28.958Z' },
  '19gax3o-171-pro-e7d0d1': { editor: GPT, appliedAt: '2026-06-24T10:17:28.958Z' },
  '1du4rf5-010-acu-1c84f8': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
  '1du4rf5-012-cit-23f1f4': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
  '1du4rf5-022-acu-0e99c6': { editor: GPT, appliedAt: '2026-06-24T10:21:31.775Z' },
  '1du4rf5-059-afi-3e9100': { editor: GPT, appliedAt: '2026-06-24T10:21:31.775Z' },
  '1du4rf5-118-acu-f7652a': { editor: GPT, appliedAt: '2026-06-24T10:21:31.775Z' },
  '1qi8axv-057-afi-f5238c': { editor: GPT, appliedAt: '2026-06-24T10:18:50.769Z' },
  '1qi8axv-088-acu-493e95': { editor: GPT, appliedAt: '2026-06-24T10:18:50.769Z' },
  '1qi8axv-115-afi-b25606': { editor: GPT, appliedAt: '2026-06-24T10:18:50.769Z' },
  '1qi8axv-115-afi-ba430a': { editor: GPT, appliedAt: '2026-06-24T10:18:50.769Z' },
  '1tgd1h4-022-cit-2326e5': { editor: GPT, appliedAt: '2026-06-24T10:22:37.743Z' },
  '1tgd1h4-030-cit-36eeae': { editor: GPT, appliedAt: '2026-06-24T10:22:37.743Z' },
  '1tgd1h4-093-acu-4e6437': { editor: GPT, appliedAt: '2026-06-24T10:22:37.743Z' },
  '1tgd1h4-107-afi-45fde0': { editor: GPT, appliedAt: '2026-06-24T10:22:37.743Z' },
  '1tgd1h4-116-cit-eb0ce5': { editor: GPT, appliedAt: '2026-06-24T10:22:37.743Z' },
  '1tgd1h4-136-cit-5138ed': { editor: GPT, appliedAt: '2026-06-24T10:22:37.743Z' },
  '1tgd1h4-149-cit-0c7568': { editor: GPT, appliedAt: '2026-06-24T10:23:59.724Z' },
  '1tgd1h4-176-afi-6c2d7f': { editor: GPT, appliedAt: '2026-06-24T10:23:59.724Z' },
  '1tgd1h4-204-cit-5ef83b': { editor: GPT, appliedAt: '2026-06-24T10:47:46.205Z' },
  '1tgd1h4-207-cit-2343c0': { editor: GPT, appliedAt: '2026-06-24T10:23:59.724Z' },
  'k4olcs-016-cit-683445': { editor: GPT, appliedAt: '2026-06-24T10:12:46.414Z' },
  'k4olcs-016-cit-7d0f3b': { editor: GPT, appliedAt: '2026-06-24T10:12:46.414Z' },
  'k4olcs-050-pro-f60a00': { editor: GPT, appliedAt: '2026-06-24T10:12:46.414Z' },
  'k4olcs-076-afi-853250': { editor: GPT, appliedAt: '2026-06-24T10:12:46.414Z' },
  'k4olcs-103-afi-b81b23': { editor: GPT, appliedAt: '2026-06-24T10:12:46.414Z' },
  'k4olcs-159-afi-4ba799': { editor: GPT, appliedAt: '2026-06-24T10:12:46.414Z' },
  'k4olcs-167-pro-5a68f8': { editor: GPT, appliedAt: '2026-06-24T10:14:20.744Z' },
  'k4olcs-168-afi-aeea8d': { editor: GPT, appliedAt: '2026-06-24T10:14:20.744Z' },
  'ma87e0-126-afi-095f32': { editor: GPT, appliedAt: '2026-06-24T10:14:20.744Z' }, // su llamada es de las 10:38, posterior a la entrada
  'otxq2c-004-cit-5f8041': { editor: GPT, appliedAt: '2026-06-24T10:21:31.775Z' },
  'otxq2c-024-cit-f56122': { editor: GPT, appliedAt: '2026-06-24T10:21:31.775Z' },
  'otxq2c-024-pro-683f46': { editor: GPT, appliedAt: '2026-06-24T10:21:31.775Z' },
  'otxq2c-049-acu-8cb9ab': { editor: GPT, appliedAt: '2026-06-24T10:22:37.743Z' },
  'qz6weg-044-acu-6c760c': { editor: GPT, appliedAt: '2026-06-24T10:18:50.769Z' },
  'qz6weg-225-afi-8005af': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
  'qz6weg-236-cit-a5ab2e': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
  'qz6weg-240-cit-7b7a50': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
  'qz6weg-278-cit-d972bb': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
  'qz6weg-284-cit-bc4bfc': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
  'qz6weg-284-pro-66d2d1': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
  'qz6weg-285-afi-6af958': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
  'qz6weg-287-cit-7e31e5': { editor: GPT, appliedAt: '2026-06-24T10:19:53.948Z' },
})
