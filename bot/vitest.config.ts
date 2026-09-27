import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * El bot tiene su propia configuración, y no tenerla costó el primer rojo del
 * workflow que acaba de nacer.
 *
 * Sin este fichero, `cd bot && vitest` sube por el árbol y carga el
 * `vitest.config.ts` de la RAÍZ. En un portátil eso no se nota —la raíz tiene
 * su `node_modules` al lado y todo resuelve—, pero en CI, donde se instalan
 * SÓLO las dependencias del bot, revienta antes de recoger un solo fichero:
 *
 *     failed to load config from /home/runner/work/civicpulse/vitest.config.ts
 *     Cannot find package 'vitest' imported from …/vitest.config.ts
 *
 * El mismo defecto, por la otra puerta, ya se había visto en local: los
 * `setupFiles` de la raíz son `./tests/setup/no-network.ts` relativos a la
 * raíz, así que ejecutar el bot desde un worktree sin instalar buscaba
 * `bot/tests/setup/no-network.ts` y no existía. Heredar la configuración de
 * otro proyecto sólo funciona mientras estén los dos instalados y encima.
 *
 * `environment: 'node'` porque esto es un servicio de Node: abre SQLite y habla
 * con la API de Telegram, y no hay un DOM en ninguna de sus pruebas. La raíz
 * usa `happy-dom` porque allí sí se renderizan componentes.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,ts}', 'src/**/*.test.{js,ts}'],
    globals: false,
    env: {
      // El bloqueo LOREG que ven las pruebas: un fixture sin bloqueo, no el
      // `public/data/promises.json` en vivo. Desde que el despliegue espera a las
      // pruebas, leer el de verdad convertía un `freeze:set` en un despliegue
      // bloqueado — con el bot sin congelar en campaña (bot/tests/freeze.test.ts).
      PROMISES_JSON: fileURLToPath(
        new URL('./tests/fixtures/promises-sin-bloqueo.json', import.meta.url),
      ),
    },
  },
})
