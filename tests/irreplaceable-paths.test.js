import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { decideIrreplaceableBash, IRREPLACEABLE } from '../.claude/hooks/irreplaceable-paths.mjs'

const HOOK = resolve(__dirname, '../.claude/hooks/guard-curated-writes.mjs')
const run = (payload) => {
  const out = execFileSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' })
  return out.trim() ? JSON.parse(out).hookSpecificOutput : null
}

describe('guard: destroying what git cannot restore', () => {
  // 2026-08-03: three voiceprints (biometric data about named councillors)
  // deleted from a directory git had never tracked, on the strength of a
  // summary that said "unused by any pipeline" — checked against automated
  // wiring only, when voice-id is a documented MANUAL step.
  it('asks before rm on every store git does not track', () => {
    for (const key of Object.keys(IRREPLACEABLE)) {
      const v = decideIrreplaceableBash(`rm -rf ${key}`)
      expect(v?.decision, key).toBe('ask')
      expect(v.reason, key).toContain('NOT tracked by git')
    }
  })

  it('asks before the sanctioned CLI too — being the right tool is not the point', () => {
    const v = decideIrreplaceableBash('npm run delete-voiceprint -- --slug robert-raga-gadea')
    expect(v?.decision).toBe('ask')
    expect(v.reason).toContain('.voiceprints')
  })

  it('carries the question that would have caught the mistake', () => {
    const v = decideIrreplaceableBash('rm -rf .voiceprints')
    expect(v.reason).toMatch(/quién lo usa, incluido a mano/i)
    expect(v.reason).toContain('WHISPER_IDENTIFY=0')
  })

  it('names who uses the store, so "nothing uses it" can be checked not assumed', () => {
    const v = decideIrreplaceableBash('rm .voiceprints/robert-raga-gadea.f32')
    expect(v.reason).toContain('identify-pleno-speakers')
    expect(v.reason).toContain('MANUAL')
  })

  it('catches a file INSIDE the store, not just the directory', () => {
    expect(decideIrreplaceableBash('rm .voiceprints/audio/x.opus')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('rm .run-manifests/extract-2026.json')?.decision).toBe('ask')
  })

  it('catches truncate, shred and find -delete, not only rm', () => {
    expect(decideIrreplaceableBash('truncate -s 0 .run-manifests/x.json')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('shred .voiceprints/a.f32')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('find .llm-cache -name "*.json" -delete')?.decision).toBe('ask')
  })

  it('catches a destructive clause anywhere in a chain', () => {
    // The shape that slips past a naive ^-anchored match.
    expect(decideIrreplaceableBash('npm test && rm -rf .voiceprints')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('cd /tmp; rm -rf .run-manifests')?.decision).toBe('ask')
  })
})

describe('guard: git clean -x is the one that takes them all at once', () => {
  it('asks, and explains that -x targets ignored files specifically', () => {
    const v = decideIrreplaceableBash('git clean -xfd')
    expect(v?.decision).toBe('ask')
    expect(v.reason).toContain('IGNORADOS')
  })

  it('lists every store that would go', () => {
    const v = decideIrreplaceableBash('git clean -xfd')
    for (const key of Object.keys(IRREPLACEABLE)) expect(v.reason).toContain(key)
  })

  it('catches -X (ignored files ONLY) as well as -x', () => {
    expect(decideIrreplaceableBash('git clean -Xfd')?.decision).toBe('ask')
  })

  it('stays quiet on a plain git clean — that only removes what git can see is new', () => {
    expect(decideIrreplaceableBash('git clean -fd')).toBeNull()
  })
})

describe('guard: it must not cry wolf', () => {
  // A hook that fires on ordinary work gets approved reflexively, and then it
  // is not a hook. These are the commands this session actually ran.
  it.each([
    'ls .voiceprints/',
    'cat .voiceprints/index.json',
    'git check-ignore -v .voiceprints',
    'du -sh .voiceprints/audio',
    'npm run enroll-voice -- --slug x --audio .voiceprints/audio/x.16k.wav',
    'npm run identify-pleno-speakers -- 10yl550',
    'rm -rf ./dist',
    'rm /tmp/scratch.json',
    'npm test',
  ])('stays quiet on: %s', (cmd) => {
    expect(decideIrreplaceableBash(cmd)).toBeNull()
  })

  it('does not fire on a path that merely looks similar', () => {
    expect(decideIrreplaceableBash('rm -rf .voiceprints-backup-copy')).toBeNull()
  })

  it('returns null for an empty or missing command', () => {
    expect(decideIrreplaceableBash('')).toBeNull()
    expect(decideIrreplaceableBash(undefined)).toBeNull()
  })
})

describe('guard: end to end through the real hook binary', () => {
  it('emits an ask verdict on stdout for the incident command', () => {
    const out = run({ tool_name: 'Bash', tool_input: { command: 'rm -rf .voiceprints' } })
    expect(out.permissionDecision).toBe('ask')
    expect(out.hookEventName).toBe('PreToolUse')
  })

  it('hands the model the same facts as additionalContext — an ask reason reaches only the person', () => {
    const out = run({ tool_name: 'Bash', tool_input: { command: 'rm -rf .voiceprints' } })
    expect(out.additionalContext).toMatch(/not tracked by git/i)
    // and a deny, whose reason already reaches the model, carries none
    const deny = run({ tool_name: 'Write', tool_input: { file_path: 'public/data/promises.json' } })
    expect(deny.additionalContext).toBeUndefined()
  })

  it('emits nothing for an ordinary command', () => {
    expect(run({ tool_name: 'Bash', tool_input: { command: 'npm test' } })).toBeNull()
  })

  it('still guards curated writes — the new check did not shadow the old one', () => {
    const out = run({
      tool_name: 'Write',
      tool_input: { file_path: 'public/data/promises.json' },
    })
    expect(out.permissionDecision).toBe('deny')
  })
})

/**
 * Lo que la reproducción sobre los transcritos dijo de esta guarda (27-09-2026):
 * nueve preguntas en todo el historial, cinco por borrar `.review-cache.json` —
 * cuya propia fila decía «recuperación: automática, falla hacia MÁS revisión» —
 * y dos por NOMBRAR `delete-voiceprint` dentro de un bucle que sólo lo buscaba
 * con grep. Y al revés, lo que no veía: desde el 25-09-2026 `editorial/` no
 * tiene copia en git (`check:editorial` impide comitearlo), y es donde viven los
 * borradores del agente, los dossiers y las capturas de prensa.
 */
describe('guard: la lista de lo irrecuperable es la de hoy', () => {
  it('no pregunta por lo que se recupera solo', () => {
    expect(decideIrreplaceableBash('rm -f ./.review-cache.json')).toBeNull()
    expect(IRREPLACEABLE['.review-cache.json']).toBeUndefined()
  })

  it('pregunta por editorial/, que desde el 25-09 no tiene copia en git', () => {
    for (const cmd of [
      'rm -rf editorial/journalist-drafts',
      'rm editorial/investigaciones/laura-guzman-bruno/dossier.md',
      'rm -rf editorial',
    ]) {
      expect(decideIrreplaceableBash(cmd)?.decision, cmd).toBe('ask')
    }
  })

  it('pregunta por las cachés que cuestan horas o dinero rehacer', () => {
    expect(decideIrreplaceableBash('rm -rf .cache/borme')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('rm -rf .cache/cesel/ccaa')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('rm -rf .embed-cache')?.decision).toBe('ask')
    // borrar .cache entero se lleva las dos, y las nombra
    const v = decideIrreplaceableBash('rm -rf .cache')
    expect(v?.decision).toBe('ask')
    expect(v.reason).toContain('.cache/borme')
    expect(v.reason).toContain('.cache/cesel')
  })

  it('pero no por lo que se vuelve a bajar en segundos, ni por la caché de otro', () => {
    expect(decideIrreplaceableBash('rm -f ".cache/bop-historico/bop-2011-04-26.json"')).toBeNull()
    expect(decideIrreplaceableBash('rm -rf .cache/speaker-map-audio')).toBeNull()
    expect(decideIrreplaceableBash('rm -rf ~/.cache/pip')).toBeNull()
  })

  it('borrar el directorio que CONTIENE un almacén también cuenta', () => {
    const v = decideIrreplaceableBash('rm -rf .')
    expect(v?.decision).toBe('ask')
  })

  it('la CLI tiene que ejecutarse, no sólo nombrarse', () => {
    for (const cmd of [
      'for f in check-cobertura delete-voiceprint enroll-voice; do grep -n "index\\.json" scripts/$f.ts; done',
      'grep -n delete-voiceprint package.json',
      'git commit -m "delete-voiceprint conserva el audio de origen"',
    ]) {
      expect(decideIrreplaceableBash(cmd), cmd).toBeNull()
    }
    expect(decideIrreplaceableBash('npx tsx scripts/delete-voiceprint.ts --slug x')?.decision).toBe(
      'ask',
    )
  })

  it('un rm dentro de un heredoc o de un mensaje es texto', () => {
    for (const cmd of [
      "cat > nota.md <<'EOF'\nrm -rf .voiceprints\nEOF",
      'git commit -m "nunca rm -rf .voiceprints"',
      'echo "rm -rf .run-manifests"',
    ]) {
      expect(decideIrreplaceableBash(cmd), cmd).toBeNull()
    }
  })

  it('le dice al MODELO lo que está a punto de borrar, no sólo a quien aprueba', () => {
    // La razón de un `ask` sólo la ve la persona. El modelo del 03-08-2026 fue
    // quien concluyó «no se usa»: el dato tiene que llegarle a él también.
    const v = decideIrreplaceableBash('rm -rf .voiceprints')
    expect(v.context).toMatch(/not tracked by git/i)
    expect(v.context).toContain('identify-pleno-speakers')
  })
})
