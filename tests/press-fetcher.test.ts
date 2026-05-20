import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, rm, writeFile, utimes } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import {
  parseRobotsTxt,
  isPathAllowed,
  extractReadableBody,
  fetchArticleBody,
  _resetRateLimitState,
} from '../src/scraper/press-fetcher'

const TMP = join(__dirname, '.tmp-press-cache')

beforeEach(async () => {
  _resetRateLimitState()
  await rm(TMP, { recursive: true, force: true })
})
afterEach(async () => {
  await rm(TMP, { recursive: true, force: true })
})

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function makeResponse(body: string, status: number, contentType: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  })
}

function makeFakeFetch(
  urlToResp: Record<string, Response>,
): (input: RequestInfo) => Promise<Response> {
  return (input: RequestInfo) => {
    const url = String(input)
    // Responses are not reusable once their body is read — clone for each call.
    if (urlToResp[url]) return Promise.resolve(urlToResp[url].clone())
    return Promise.resolve(makeResponse('not found', 404, 'text/plain'))
  }
}

describe('press-fetcher — parseRobotsTxt', () => {
  it('returns wildcard rules in declaration order', () => {
    const rules = parseRobotsTxt(`
User-agent: *
Disallow: /admin
Allow: /public
Disallow: /private
    `)
    expect(rules).toEqual([
      { allow: false, path: '/admin' },
      { allow: true, path: '/public' },
      { allow: false, path: '/private' },
    ])
  })

  it('prefers CivicPulse-specific rules over wildcard', () => {
    const rules = parseRobotsTxt(`
User-agent: *
Disallow: /

User-agent: CivicPulse
Allow: /articles
    `)
    expect(rules).toEqual([{ allow: true, path: '/articles' }])
  })

  it('ignores comments and unknown directives', () => {
    const rules = parseRobotsTxt(`
# leading comment
User-agent: *
Sitemap: https://example.com/sitemap.xml
Disallow: /api
    `)
    expect(rules).toEqual([{ allow: false, path: '/api' }])
  })

  it('returns empty rules when no User-agent section matches', () => {
    expect(parseRobotsTxt('User-agent: SomeOtherBot\nDisallow: /')).toEqual([])
  })
})

describe('press-fetcher — isPathAllowed', () => {
  it('allows when no rules match', () => {
    expect(isPathAllowed([], '/articles/123')).toBe(true)
  })

  it('first-match wins', () => {
    const rules = [
      { allow: false, path: '/private' },
      { allow: true, path: '/' },
    ]
    expect(isPathAllowed(rules, '/private/x')).toBe(false)
    expect(isPathAllowed(rules, '/public/y')).toBe(true)
  })

  it('treats empty-path disallow as no-op', () => {
    expect(isPathAllowed([{ allow: false, path: '' }], '/anything')).toBe(true)
  })

  it('treats empty-path allow as allow-all', () => {
    expect(isPathAllowed([{ allow: true, path: '' }], '/anything')).toBe(true)
  })
})

describe('press-fetcher — extractReadableBody', () => {
  it('extracts <article>, strips nav/script/aside', async () => {
    const html = `
      <html><body>
        <nav>nav junk</nav>
        <script>var x = 1;</script>
        <article>
          <p>Real article body about Riba-roja.</p>
          <p>Second paragraph with more text.</p>
        </article>
        <aside>related links</aside>
      </body></html>
    `
    const body = await extractReadableBody(html, 1024)
    expect(body).toMatch(/Real article body/)
    expect(body).not.toMatch(/var x/)
    expect(body).not.toMatch(/nav junk/)
    expect(body).not.toMatch(/related links/)
  })

  it('caps the extracted body at maxBytes', async () => {
    const long = 'A'.repeat(10_000)
    const html = `<html><body><article><p>${long}</p></article></body></html>`
    const body = await extractReadableBody(html, 500)
    expect(body.length).toBeLessThanOrEqual(500)
  })

  it('falls back to <body> when no <article>/<main>', async () => {
    const html = `<html><body><div><p>solo</p></div></body></html>`
    const body = await extractReadableBody(html, 1024)
    expect(body).toMatch(/solo/)
  })
})

describe('press-fetcher — fetchArticleBody', () => {
  it('returns the body when robots allows + fetch succeeds', async () => {
    const fakeFetch = makeFakeFetch({
      'https://example.test/robots.txt': makeResponse(
        'User-agent: *\nAllow: /',
        200,
        'text/plain',
      ),
      'https://example.test/article/1': makeResponse(
        '<html><body><article><p>Article content one two three.</p></article></body></html>',
        200,
        'text/html',
      ),
    })
    const result = await fetchArticleBody('https://example.test/article/1', {
      cacheDir: TMP,
      fetchImpl: fakeFetch as any,
      now: () => 1_000_000,
    })
    expect(result.robotsAllowed).toBe(true)
    expect(result.fromCache).toBe(false)
    expect(result.body).toMatch(/Article content/)
  })

  it('returns body=empty when robots disallows', async () => {
    const fakeFetch = makeFakeFetch({
      'https://blocked.test/robots.txt': makeResponse(
        'User-agent: *\nDisallow: /',
        200,
        'text/plain',
      ),
    })
    const result = await fetchArticleBody('https://blocked.test/article/1', {
      cacheDir: TMP,
      fetchImpl: fakeFetch as any,
      now: () => 1_000_000,
    })
    expect(result.robotsAllowed).toBe(false)
    expect(result.body).toBe('')
    expect(result.contentType).toBe('denied')
  })

  it('hits the cache on the second call', async () => {
    let fetchCount = 0
    const fakeFetch = ((input: RequestInfo) => {
      fetchCount++
      const url = String(input)
      if (url.endsWith('/robots.txt'))
        return Promise.resolve(makeResponse('User-agent: *\nAllow: /', 200, 'text/plain'))
      return Promise.resolve(
        makeResponse(
          '<html><body><article><p>Cached content body example.</p></article></body></html>',
          200,
          'text/html',
        ),
      )
    }) as typeof fetch

    const opts = { cacheDir: TMP, fetchImpl: fakeFetch, now: () => 2_000_000 }
    const r1 = await fetchArticleBody('https://cache.test/a', opts)
    expect(r1.fromCache).toBe(false)
    const after = fetchCount

    const r2 = await fetchArticleBody('https://cache.test/a', opts)
    expect(r2.fromCache).toBe(true)
    expect(fetchCount).toBe(after) // no additional network calls
    expect(r2.body).toMatch(/Cached content/)
  })

  it('expires the cache after bodyTtlMs and refetches', async () => {
    const fakeFetch = makeFakeFetch({
      'https://expire.test/robots.txt': makeResponse(
        'User-agent: *\nAllow: /',
        200,
        'text/plain',
      ),
      'https://expire.test/a': makeResponse(
        '<html><body><article><p>Fresh body content after expiry.</p></article></body></html>',
        200,
        'text/html',
      ),
    })

    await mkdir(TMP, { recursive: true })
    const cachePath = join(TMP, sha256('https://expire.test/a') + '.html')
    await writeFile(cachePath, 'stale body', 'utf8')
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    await utimes(cachePath, new Date(eightDaysAgo), new Date(eightDaysAgo))

    const result = await fetchArticleBody('https://expire.test/a', {
      cacheDir: TMP,
      fetchImpl: fakeFetch as any,
      now: () => Date.now(),
    })
    expect(result.fromCache).toBe(false)
    expect(result.body).toMatch(/Fresh body/)
  })

  it('rate-limits the second request to the same host', async () => {
    const fakeFetch = makeFakeFetch({
      'https://rl.test/robots.txt': makeResponse('User-agent: *\nAllow: /', 200, 'text/plain'),
      'https://rl.test/a': makeResponse(
        '<html><body><article><p>First article body content.</p></article></body></html>',
        200,
        'text/html',
      ),
      'https://rl.test/b': makeResponse(
        '<html><body><article><p>Second article body content.</p></article></body></html>',
        200,
        'text/html',
      ),
    })
    const sleepCalls: number[] = []
    const sleep = (ms: number) => {
      sleepCalls.push(ms)
      return Promise.resolve()
    }
    let t = 1_000_000_000
    const now = () => t

    await fetchArticleBody('https://rl.test/a', {
      cacheDir: TMP,
      fetchImpl: fakeFetch as any,
      now,
      sleep,
      minHostIntervalMs: 2000,
    })
    t = t + 500
    await fetchArticleBody('https://rl.test/b', {
      cacheDir: TMP,
      fetchImpl: fakeFetch as any,
      now,
      sleep,
      minHostIntervalMs: 2000,
    })
    expect(sleepCalls.length).toBe(1)
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(1)
  })

  it('refuses invalid URLs', async () => {
    const result = await fetchArticleBody('not-a-url', {
      cacheDir: TMP,
      fetchImpl: (() => Promise.resolve(makeResponse('', 200, 'text/plain'))) as any,
      now: () => 1,
    })
    expect(result.robotsAllowed).toBe(false)
    expect(result.contentType).toBe('invalid-url')
  })
})
