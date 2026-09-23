import { describe, it, expect } from 'vitest'
import { claudeCodeArgs, CLAUDE_CODE_DISALLOWED_TOOLS } from '../src/llm/client'

/**
 * La superficie de herramientas de `claude -p`. `--allowedTools StructuredOutput`
 * sólo PRE-APRUEBA esa herramienta: las demás seguían a la vista, y el
 * descubrimiento del auto-curador de promesas se pasó 17 pasadas de 17
 * intentando WebFetch, WebSearch y Bash —denegados uno tras otro— hasta que el
 * vigilante lo mataba a los 45 s. Esto fija las dos mitades: una permitida, el
 * resto vetado por nombre, y nunca con `'*'`, que veta también la de salida.
 */
const args = claudeCodeArgs(
  { userPrompt: 'u', systemPrompt: 's', config: { claudeCodeModel: 'claude-sonnet-5' } },
  '{}',
)
const valorDe = (flag: string) => args[args.indexOf(flag) + 1]

describe('claudeCodeArgs · la superficie de herramientas', () => {
  it('permite sólo StructuredOutput', () => {
    expect(valorDe('--allowedTools')).toBe('StructuredOutput')
  })

  it('veta por nombre las herramientas con las que el modelo salía a buscar', () => {
    const vetadas = valorDe('--disallowedTools').split(',')
    for (const t of ['WebFetch', 'WebSearch', 'Bash', 'ToolSearch']) {
      expect(vetadas, t).toContain(t)
    }
    expect(vetadas).toEqual([...CLAUDE_CODE_DISALLOWED_TOOLS])
  })

  it('nunca veta con comodín ni veta la herramienta de salida', () => {
    const vetadas = valorDe('--disallowedTools').split(',')
    expect(vetadas).not.toContain('*')
    expect(vetadas).not.toContain('StructuredOutput')
  })

  it('conserva el aislamiento de MCP', () => {
    expect(args).toContain('--strict-mcp-config')
  })
})
