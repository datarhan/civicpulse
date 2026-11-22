#!/usr/bin/env tsx
/**
 * veda:activa — imprime la fecha de fin de la veda electoral si está activa, y
 * nada si no lo está. Es una CONSULTA para los scripts de shell
 * (`hallazgos-pipeline.sh`), que no pueden importar `isFrozen`.
 *
 *   npm run --silent veda:activa        # «2027-05-24» o vacío; sale 0
 *
 * Sale 1 si no puede leer `promises.json`: quien la llama lo trata como veda
 * («no sé si hay veda» no es «no la hay»). La lógica está en `lib/veda.ts`.
 */
import { vedaActiva } from './lib/veda'

try {
  const hasta = vedaActiva()
  if (hasta) process.stdout.write(`${hasta}\n`)
} catch (err) {
  process.stderr.write(`[veda:activa] ${(err as Error).message}\n`)
  process.exitCode = 1
}
