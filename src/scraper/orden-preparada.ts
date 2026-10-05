/**
 * orden-preparada — los huecos de una orden que una cola de revisión compone
 * para que la firme una persona en su terminal.
 *
 * Cuatro colas componen órdenes así, y ninguna las ejecuta: la de excepción
 * (finding-exception.ts), la de apoyo (finding-support.ts) y las dos de
 * reanclaje (quote-reanchor.ts y claim-reanchor.ts). El operador las copia
 * —con el botón de /curator, de la terminal o del fichero de la cola—, y lo que
 * no rellena llega a la CLI tal cual. Por eso cada hueco es más corto de lo que
 * exige la CLI que lo recibe: una orden copiada sin rellenar se rechaza antes de
 * escribir nada.
 *
 * Lo enseñaron dos huecos largos. Las tres últimas colas componían
 * `--reason "<por qué, ≥20 caracteres>"`: 25 caracteres, que pasan el suelo de
 * 20 de `correct-pleno-finding` y de `reanchor-claim`. Con el texto nuevo y la
 * firma rellenos y el motivo no, la corrección se escribía con el hueco como
 * motivo publicado, el que BitacoraCorrecciones imprime en /hallazgos
 * (reproducido el 04-10-2026, durante la PR #224). Y la de citas componía
 * `--new "<el literal del texto nuevo, copiado tal cual>"`, 49 caracteres donde
 * el validador sólo pide 20 a una cita: con el motivo relleno y el literal no,
 * el hueco se publicaba como cita textual de un grupo, con la de verdad tachada
 * en la bitácora. La prueba es tests/orden-sin-rellenar-cli.test.ts, que lanza
 * cada orden tal como la compone su cola.
 *
 * Sin dependencias, a propósito: la página alcanza quote-reanchor.ts por
 * `formatTimecode`, y estos huecos no deben arrastrar al navegador el enum de
 * las declaraciones, que finding-exception.ts necesita para el único hueco que
 * añade, el tipo.
 */
export const HUECOS = {
  /** `--editor` y `--reviewer`. `rechazoDeMarcador` lo rechaza además por los `< >`. */
  firma: '<nombre y apellidos>',
  /** `--reason`: las CLIs que lo reciben piden 20 caracteres o más. */
  motivo: '<motivo>',
  /** `--note` de `review:finding-exception`, que pide `NOTA_MINIMA` (20). */
  nota: '<por qué>',
  /** `--new` de un sumario: el validador pide 40, y `--redact` lo rechaza como muñón. */
  sumario: '<sumario nuevo>',
  /** `--new` del literal de una cita: el validador pide 20 (`validateQuote`). */
  literal: '<literal nuevo>',
} as const
