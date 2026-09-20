import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, mkdtempSync, symlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { decide, decideBash, canonical, CURATED } from '../.claude/hooks/curated-paths.mjs'

// The PreToolUse guard is the only rule in this repo that is enforced rather
// than merely documented, so it needs the same discipline as an adapter: if it
// silently stops matching, nothing else notices.

const never = () => false // pretend the path does not exist yet
const always = () => true
const HOOK = resolve(__dirname, '../.claude/hooks/guard-curated-writes.mjs')

/** Drive the hook the way Claude Code does: JSON on stdin, JSON on stdout. */
const run = (payload, bin = HOOK) => {
  const out = execFileSync('node', [bin], { input: JSON.stringify(payload), encoding: 'utf8' })
  return out.trim() ? JSON.parse(out).hookSpecificOutput.permissionDecision : null
}

describe('guard: curated files', () => {
  it('denies a direct write to every curated snapshot, naming its CLI', () => {
    for (const name of Object.keys(CURATED)) {
      const v = decide(`public/data/${name}`, never)
      expect(v?.decision, name).toBe('deny')
      expect(v.reason, name).toContain(CURATED[name])
    }
  })

  it('only fires inside public/data — a same-named fixture is fair game', () => {
    expect(decide('tests/fixtures/promises.json', never)).toBeNull()
    expect(decide('editorial/promises.json', never)).toBeNull()
  })

  // The guard's allow-list is a hand-kept copy of a fact that lives elsewhere,
  // which is the exact pattern DATA_INTEGRITY.md rule 1 is about. It cannot
  // import the doc, so it asserts against it instead: a curated file added to
  // docs/DATA_SOURCES.md without being added here would leave the new file
  // unguarded, and nothing would have failed.
  it('covers every curated file listed in docs/DATA_SOURCES.md', () => {
    const doc = readFileSync(resolve(__dirname, '../docs/DATA_SOURCES.md'), 'utf8')
    const section = doc.split('### Curated')[1].split('###')[0]
    const listed = [...section.matchAll(/`([a-z-]+\.json)`/g)].map((m) => m[1])
    expect(listed.length).toBeGreaterThan(8)
    expect(listed.filter((f) => !CURATED[f])).toEqual([])
  })
})

// Three bypasses a security review found in the first version. Each of these
// reproduces one; all three passed the guard as originally committed.
describe('guard: bypasses that used to work', () => {
  // path-substring-check: `includes('public/data/')` over an unnormalized
  // string. Every spelling below opens the same file.
  it('normalizes the path before matching', () => {
    for (const p of [
      'public/data/promises.json',
      './public/data/promises.json',
      'public/./data/promises.json', // used to ALLOW
      'public//data/promises.json', // used to ALLOW
      'public/data/../data/promises.json',
      'src/../public/data/promises.json',
    ]) {
      expect(decide(p, never)?.decision, p).toBe('deny')
    }
  })

  it('canonical() collapses the spellings to one', () => {
    for (const p of ['public/./data/x.json', 'public//data/x.json', './public/data/x.json']) {
      expect(canonical(p)).toBe('public/data/x.json')
    }
  })

  // allowlist-semantic-escape: the settings matcher covered Write|Edit|
  // NotebookEdit, so a shell redirect achieved the same edit untouched — and is
  // the obvious next move once a Write is denied.
  it('catches shell writes to a curated file', () => {
    for (const cmd of [
      'echo "{}" > public/data/promises.json',
      'cat x.json >> public/data/pleno-votes.json',
      "sed -i '' s/a/b/ public/data/sindic.json",
      'cp /tmp/x.json public/data/promises.json',
      'jq . x.json | tee public/data/promises.json',
    ]) {
      expect(decideBash(cmd)?.decision, cmd).toBe('ask')
    }
  })

  it('leaves reads and the sanctioned CLIs alone', () => {
    for (const cmd of [
      'jq . public/data/promises.json',
      'cat public/data/promises.json | head',
      'npm run reply -- p-1 PSOE "una cita verbatim suficientemente larga"',
      'git diff public/data/promises.json',
      'npm test',
      // cp/mv write only their LAST argument — this one reads it out to a
      // backup, which is exactly what you want to stay easy.
      'cp public/data/promises.json /tmp/backup.json',
    ]) {
      expect(decideBash(cmd), cmd).toBeNull()
    }
  })

  // parser-differential: main() only ran when argv[1] ended in the script's own
  // filename, so a symlink or renamed copy allowed everything AND printed
  // nothing — indistinguishable from a pass.
  it('still guards when invoked through a symlink', () => {
    const link = join(mkdtempSync(join(tmpdir(), 'cp-guard-')), 'renamed.mjs')
    symlinkSync(HOOK, link)
    const payload = { tool_name: 'Write', tool_input: { file_path: 'public/data/promises.json' } }
    expect(run(payload, link)).toBe('deny')
  })

  it('guards end-to-end over the real stdin/stdout contract', () => {
    expect(
      run({ tool_name: 'Write', tool_input: { file_path: 'public/data/promises.json' } }),
    ).toBe('deny')
    expect(
      run({ tool_name: 'Bash', tool_input: { command: 'echo x > public/data/sindic.json' } }),
    ).toBe('ask')
    expect(run({ tool_name: 'Read', tool_input: { file_path: 'public/data/promises.json' } })).toBe(
      null,
    )
  })
})

/**
 * Un fichero que se edita A MANO no tiene CLI que le mueva el sello.
 *
 * `apply-promise-draft`, `sindic:add` y los demás CLIs estampan `generatedAt` al
 * escribir. Siete ficheros curados no tienen CLI: los edita una persona vía PR, y
 * el guard, al rechazar la escritura, es quien le dice a la sesión que pase el
 * cambio a esa persona. Hasta aquí ese mensaje no decía nada del sello.
 *
 * El 17-09-2026 (16f5ee62) pasó exactamente eso con `sociedades.json`: la ficha
 * de Hidraqua se corrigió a mano, bien y validada, y `generatedAt` se quedó en el
 * 23 de agosto. `check:stamps` lo cazó —es la segunda vez, tras c66cf931 con
 * `promises.json`— pero a posteriori y por Telegram. El momento de decirlo es
 * cuando se entrega la edición, no dos días después.
 */
describe('guard: una edición a mano no tiene quién le mueva el sello', () => {
  const aMano = Object.entries(CURATED).filter(([, owner]) => /hand-edit/.test(owner))
  const sello = (name) => {
    const o = JSON.parse(readFileSync(resolve('public/data', name), 'utf8'))
    return typeof o.generatedAt === 'string' ? o.generatedAt : null
  }

  it('mide algo: hay ficheros a mano con sello y al menos uno sin él', () => {
    // Sin las dos clases en disco, las pruebas de abajo pasarían sin comprobar nada.
    expect(aMano.filter(([n]) => sello(n)).length).toBeGreaterThan(0)
    expect(aMano.filter(([n]) => !sello(n)).length).toBeGreaterThan(0)
  })

  it('recuerda el sello al rechazar la escritura, con el valor que el fichero lleva hoy', () => {
    for (const [name] of aMano.filter(([n]) => sello(n))) {
      const v = decide(`public/data/${name}`)
      expect(v.decision, name).toBe('deny')
      expect(v.reason, name).toContain('"generatedAt"')
      expect(v.reason, name).toContain(sello(name))
      expect(v.reason, name).toMatch(/check:stamps/)
      // Y la puerta que existe para moverlo sin tocar nada más.
      expect(v.reason, name).toContain(`npm run restamp -- ${name}`)
    }
  })

  it('el reproductor: sociedades.json', () => {
    expect(decide('public/data/sociedades.json').reason).toMatch(/check:stamps/)
  })

  it('no promete un sello a un fichero que no lo lleva', () => {
    // El motivo tiene que ser cierto de CADA fichero para el que se enseña: un
    // aviso con un motivo que no aplica es uno que se deja de leer.
    for (const [name] of aMano.filter(([n]) => !sello(n))) {
      expect(decide(`public/data/${name}`).reason, name).not.toMatch(/check:stamps/)
    }
  })

  it('no dice nada del sello cuando el dueño es un CLI: ese sí lo mueve', () => {
    const conCli = Object.entries(CURATED).filter(([, owner]) => !/hand-edit/.test(owner))
    expect(conCli.length).toBeGreaterThan(0)
    for (const [name] of conCli) {
      expect(decide(`public/data/${name}`).reason, name).not.toMatch(/check:stamps/)
    }
  })

  it('un fichero ilegible se sigue rechazando, sin sello que recordar', () => {
    const v = decide('public/data/sociedades.json', undefined, () => '{ esto no es json')
    expect(v.decision).toBe('deny')
    expect(v.reason).not.toMatch(/check:stamps/)
  })
})

describe('guard: published surface', () => {
  it('asks before creating a NEW draft/suggestion file under public/', () => {
    const v = decide('public/data/journalist-reports-suggestions.json', never)
    expect(v?.decision).toBe('ask')
    expect(v.reason).toMatch(/editorial\//)
  })

  it('stays silent on suggestion files that already exist', () => {
    // Scrapers rewrite these nightly. A guard that nags on every routine
    // rewrite is a guard that gets switched off.
    expect(decide('public/data/promise-suggestions.json', always)).toBeNull()
  })

  it('leaves drafts in editorial/ alone — that is where they belong', () => {
    expect(decide('editorial/journalist-drafts/a-x-bio.draft.json', never)).toBeNull()
  })

  it('ignores ordinary source files and snapshots', () => {
    expect(decide('src/App.jsx', never)).toBeNull()
    expect(decide('public/data/tenders.json', never)).toBeNull()
    expect(decide(undefined, never)).toBeNull()
  })

  it('the real suggestion snapshots on disk are all already present', () => {
    // Guards against the ask-branch turning into permanent noise: if one of
    // these were missing, every nightly rewrite would prompt.
    for (const f of ['promise-suggestions.json', 'place-suggestions.json']) {
      expect(existsSync(resolve(__dirname, `../public/data/${f}`)), f).toBe(true)
    }
  })
})

describe('guard: the settings matcher must reach every write path', () => {
  // A perfect decide() protects nothing if the tool never routes through it.
  it('registers the file-writing tools and Bash', () => {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../.claude/settings.json'), 'utf8'))
    const matcher = cfg.hooks.PreToolUse[0].matcher
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash']) {
      expect(new RegExp(`^(${matcher})$`).test(tool), tool).toBe(true)
    }
  })
})
