// The AI guides as public pages of a build (user 2026-11-21): web/public/ai/*.md, served at <base>ai/, no token. They
// are copies of docs/, the source the relay and the dev server read. After an edit there: cp ../docs/ai-shader-guide.md
// public/ai/shader-guide.md && cp ../docs/ai-chatgpt.md public/ai/chatgpt.md (cwd = web/).
import { expect, test } from 'vitest'

const fsId = 'node:fs' // the app tsconfig has no node types (presets.test.ts)

test('web/public/ai/ holds the docs/ guides as they are', async () => {
  const { readFileSync } = (await import(/* @vite-ignore */ fsId)) as { readFileSync(p: URL, enc: 'utf8'): string }
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [page, src] of [['shader-guide.md', 'ai-shader-guide.md'], ['chatgpt.md', 'ai-chatgpt.md']])
    expect(read(`../public/ai/${page}`), `copy docs/${src} to web/public/ai/${page}`).toBe(read(`../../docs/${src}`))
})
