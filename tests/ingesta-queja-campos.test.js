import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leer } from './setup/workflows.js'

/**
 * Los campos de una respuesta a una queja llegan enteros al CLI.
 *
 * EL FALLO, medido el 2026-09-27: el paso que extrae los campos del issue los
 * deja en /tmp/fields separados por NUL, y el paso que aplica la respuesta los
 * leía con `IFS=$'\0' read -rd '' QID ROLE FIRMANTE TEXT URL`. Bash no puede
 * guardar un NUL en IFS, así que no separaba nada: leía el Q-ID y dejaba vacíos
 * rol, firmante y texto, y `queja-reply` rechazaba toda respuesta oficial a una
 * queja —la de una concejalía, un departamento o la alcaldía— que entrara por
 * el formulario. Nadie lo vio porque nada ejecutaba ese bloque.
 *
 * Aquí se ejecutan las líneas DEL WORKFLOW: el `printf` que escribe el fichero y
 * el bloque entre `# campos:inicio` y `# campos:fin` que lo lee.
 */
const WF = leer('ingest-queja-responses.yml')

const escritura = (WF.match(/^ *printf '%s\\0' .*> \/tmp\/fields$/m) ?? [])[0]
const lectura = (WF.match(/# campos:inicio\n([\s\S]*?)\n *# campos:fin/) ?? [])[1]

describe('ingest-queja-responses · los campos cruzan de un paso al otro', () => {
  it('encuentra las dos mitades en el workflow', () => {
    expect(escritura, 'no encuentro el printf que escribe /tmp/fields').toBeTruthy()
    expect(lectura, 'no encuentro el bloque # campos:inicio … # campos:fin').toBeTruthy()
  })

  it('rol, firmante, un texto de varias líneas y una URL vacía llegan como salieron', () => {
    const dir = mkdtempSync(join(tmpdir(), 'queja-campos-'))
    try {
      const fichero = join(dir, 'fields')
      const guion = [
        'set -euo pipefail',
        escritura.trim().replaceAll('/tmp/fields', '"$FICHERO"'),
        lectura.replaceAll('/tmp/fields', '"$FICHERO"'),
        'printf "%s\\n--\\n" "$QID" "$ROLE" "$FIRMANTE" "$TEXT" "[$URL]"',
      ].join('\n')
      const salida = execFileSync('bash', ['-c', guion], {
        encoding: 'utf8',
        env: {
          ...process.env,
          FICHERO: fichero,
          QID: 'Q-ABC12301',
          ROLE: 'Concejalía responsable',
          FIRMANTE: 'Concejalía de Obras',
          TEXT: 'El Servicio de Obras ha programado la reparación.\nLa ejecución está pendiente.',
          URL: '',
        },
      })
      expect(salida.split('\n--\n').slice(0, 5)).toEqual([
        'Q-ABC12301',
        'Concejalía responsable',
        'Concejalía de Obras',
        'El Servicio de Obras ha programado la reparación.\nLa ejecución está pendiente.',
        '[]',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
