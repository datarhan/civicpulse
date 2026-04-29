#!/usr/bin/env tsx
/**
 * Snapshot the open `derecho-replica` GitHub issues so the curator
 * dashboard can render them without hitting the GitHub API from the
 * browser (avoids the 60 req/h IP-based rate limit and the IP leak).
 *
 *   npm run refresh:gh-issues                  # ~1 API call
 *   GITHUB_TOKEN=... npm run refresh:gh-issues # avoids the un-authed limit
 *
 * Writes `public/data/finding-response-issues.json`. The dashboard
 * reads this file directly. Refresh whenever a new reply has been
 * filed; otherwise the snapshot is fine to be stale for a day.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = process.env.GITHUB_REPO ?? 'datarhan/civicpulse'
const OUT = resolve('public/data/finding-response-issues.json')

interface IssueRow {
  number: number
  title: string
  url: string
  state: string
  createdAt: string
  updatedAt: string
  labels: string[]
  authorLogin: string
  bodyExcerpt: string
}

async function fetchIssues(): Promise<IssueRow[]> {
  const url = `https://api.github.com/repos/${REPO}/issues?labels=derecho-replica&state=open&per_page=50`
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'civicpulse-curator-dashboard',
  }
  const hasToken = !!process.env.GITHUB_TOKEN
  if (hasToken) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  const res = await fetch(url, { headers })
  if (!res.ok) {
    // GitHub returns 404 for both "repo doesn't exist" and "private
    // repo, no auth" — they don't disclose existence to anonymous
    // callers. Surface a more actionable diagnostic so the curator
    // knows what to fix.
    if (res.status === 404 && !hasToken) {
      throw new Error(
        `GitHub 404 on ${REPO} (no GITHUB_TOKEN). Repo may be private — set GITHUB_TOKEN in .env, or override the path with GITHUB_REPO=<owner>/<repo>.`,
      )
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `GitHub ${res.status} on ${REPO} — token is set but lacks permission. Generate a fresh token with at least \`repo\` scope at https://github.com/settings/tokens.`,
      )
    }
    throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = (await res.json()) as Array<{
    number: number
    title: string
    html_url: string
    state: string
    created_at: string
    updated_at: string
    labels: Array<{ name: string }>
    user: { login: string }
    body: string | null
    pull_request?: unknown
  }>
  // Filter out PRs (the issues endpoint returns both).
  return data
    .filter((d) => !d.pull_request)
    .map((d) => ({
      number: d.number,
      title: d.title,
      url: d.html_url,
      state: d.state,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      labels: d.labels.map((l) => l.name),
      authorLogin: d.user?.login ?? '',
      bodyExcerpt: (d.body ?? '').slice(0, 600),
    }))
}

async function main() {
  let issues: IssueRow[] = []
  let error: string | null = null
  try {
    issues = await fetchIssues()
  } catch (err) {
    error = (err as Error).message
    process.stderr.write(`[refresh-gh-issues] ${error}\n`)
  }
  mkdirSync(resolve('public/data'), { recursive: true })
  const doc = {
    generatedAt: new Date().toISOString(),
    repo: REPO,
    issueCount: issues.length,
    error,
    issues,
  }
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  process.stdout.write(`[refresh-gh-issues] ${issues.length} issue(s) → ${OUT}\n`)
}

main().catch((err) => {
  process.stderr.write(`[refresh-gh-issues] fatal: ${err.message}\n`)
  process.exit(1)
})
