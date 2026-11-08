import { execFileSync } from 'node:child_process'

import yaml from 'js-yaml'

const token = process.env.GITHUB_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' }

export const api = async path => {
  const response = await fetch(`https://api.github.com/${path}`, { headers })

  if (response.status === 404 || response.status === 409) return null
  if (!response.ok) throw new Error(`GitHub ${path}: HTTP ${response.status}`)

  return response.json()
}

export const graphql = async (query, attempt = 1) => {
  const response = await fetch('https://api.github.com/graphql', { method: 'POST', headers, body: JSON.stringify({ query }) })

  if (response.status >= 500 && attempt < 4) return graphql(query, attempt + 1)
  if (!response.ok) throw new Error(`GitHub GraphQL: HTTP ${response.status}`)

  const { data, errors } = await response.json()
  const fatal = (errors ?? []).filter(error => !['NOT_FOUND', 'FORBIDDEN'].includes(error.type) && !error.message?.includes('IP allow list'))

  if (fatal.length > 0) throw new Error(`GitHub GraphQL: ${fatal.map(error => error.message).join('; ')}`)

  return data
}

export const publicRepo = async repo => {
  const response = await fetch(`https://api.github.com/repos/${repo}`, { headers: { accept: 'application/vnd.github+json' } })

  return response.ok ? response.json() : null
}

const rawUrl = (repo, commit, path) => `https://raw.githubusercontent.com/${repo}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`

export const raw = async (repo, commit, path, attempt = 1) => {
  const response = await fetch(rawUrl(repo, commit, path))

  if (response.status >= 500 && attempt < 4) return raw(repo, commit, path, attempt + 1)
  if (!response.ok) throw new Error(`${repo}/${path}: HTTP ${response.status}`)

  return response.text()
}

export { rawUrl }

export const each = async (items, work, parallel = 16) => {
  const results = new Array(items.length)
  let next = 0

  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index])
    }
  }))

  return results
}

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export const split = source => {
  const match = FRONTMATTER.exec(source)

  if (match === null) return { meta: {}, body: source }

  try {
    return { meta: yaml.load(match[1]) ?? {}, body: source.slice(match[0].length) }
  } catch (error) {
    if (!(error instanceof yaml.YAMLException)) throw error

    return { meta: null, body: source.slice(match[0].length) }
  }
}

export const blobsAt = async (repo, commit) => {
  const answer = await api(`repos/${repo}/git/trees/${commit}?recursive=1`)

  if (answer === null || answer.truncated) return null

  return answer.tree.filter(entry => entry.type === 'blob').map(entry => entry.path)
}

const OPEN_LICENSES = new Set(['MIT', 'APACHE-2.0', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE', 'ISC', '0BSD', 'UNLICENSE', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0'])

const ENGLISH_WORDS = /\b(the|and|of|for|with|that|from|to|an?|in|on|your|by|through|into|agents?|adapter|run|runs)\b/gi
const OTHER_WORDS = /\b(und|der|die|das|mit|für|von|ein|eine|para|com|uma|um|de|da|do|em|que|el|los|las|y|et|le|la|les|pour|des|une|ao|na|no|sob|por|adaptador|externo|seguro)\b/gi

export const isEnglish = text => {
  const letters = text.match(/\p{L}/gu) ?? []
  const latin = letters.filter(letter => /\p{Script=Latin}/u.test(letter)).length

  if (letters.length > 0 && latin / letters.length < 0.9) return false

  return (text.match(OTHER_WORDS) ?? []).length <= (text.match(ENGLISH_WORDS) ?? []).length
}

export const isOpen =license => typeof license === 'string' && OPEN_LICENSES.has(license.toUpperCase())
