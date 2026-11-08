import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { api, blobsAt, each, graphql, isEnglish, isOpen, publicRepo, raw, rawUrl, split } from './github.mjs'

const [outPath = 'results/agents.json'] = process.argv.slice(2)
const COMPANIES = 'https://t-ai-labs.github.io/awesome-paperclip-companies/'
const HISTORY = 'data/history.json'
const WEEKS = 12
const DAY = 86_400_000

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const dayOf = date => date.toISOString().slice(0, 10)
const today = dayOf(new Date())
const warn = message => console.warn(`  ! ${message}`)

const text = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')
const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const plain = markdown => markdown
  .replace(/<example>[\s\S]*?<\/example>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\\n/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\*\*|__|`/g, '')
  .replace(/(^|\s)[*_](\S)/g, '$1$2')
  .replace(/(\S)[*_](?=\s|$|[.,;:!?)])/g, '$1')
  .replace(/\s+/g, ' ')
  .trim()

const shorten = (value, max = 280) => {
  if (value.length <= max) return value

  const cut = value.slice(0, max)
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))

  return sentence > max * 0.4 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s-]+$/, '')}…`
}

// "You are the Release Engineer of Superpowers Dev Shop." only repeats the title and company the list already shows.
const INTRO = /^You are (the |an? )?[^]*?\.\s+(?=You |Your )/

const summaryOf = body => {
  const paragraphs = []

  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const trimmed = block.trim()

    if (trimmed === '' || /^(#|```|\||<|---|>|[-*+] |\d+\. )/.test(trimmed)) continue

    const line = plain(trimmed)

    if (line.length >= 25) paragraphs.push(line)
    if (paragraphs.length === 2 || paragraphs.join(' ').length > 200) break
  }

  const text = paragraphs.join(' ')
  const rest = text.replace(INTRO, '')

  return shorten(rest.length >= 40 ? rest : text)
}

const CATEGORY_WORDS = [
  ['security', /\b(secur|pentest|penetration|vulnerab|threat|exploit|malware|forensic|appsec|red.?team|blue.?team|incident.respon|compliance|gdpr|hipaa|privacy|fuzz|reverse.?engineer|cryptograph|smart.contract.audit)/i],
  ['research', /\b(research|scien|academic|papers?\b|literature|biolog|bioinform|chemi|clinical|genom|physic|scholar|lab\b)/i],
  ['creative', /\b(design|ux\b|ui\b|brand|content|writer|writing|copywrit|editor|video|game|artist|art.director|music|audio|media|storytell|illustrat|animat|podcast|journalis|narrative)/i],
  ['business', /\b(ceo|cfo|coo|cmo|cro|chief (executive|financial|operating|marketing|revenue|people)|market|sales|seo|growth|financ|accounti|accountant|legal|lawyer|counsel|contract|hr\b|recruit|talent|customer|support|success|product (manager|owner|lead|strateg)|strateg|operations|business|consult|advisor|investor|venture|pricing|procurement|real.estate|e-?commerce|founder|executive|partnership)/i],
  ['data', /\b(data|analytic|machine.?learning|ml\b|mlops|ai.engineer|llm|prompt|nlp|database|sql|postgres|etl|warehouse|statistic|rag\b|embedding)/i],
  ['software', /\b(engineer|developer|devops|sre\b|frontend|front-end|backend|back-end|full.?stack|code|coding|programm|architect|debug|test|qa\b|quality|kubernetes|docker|cloud|terraform|api|mobile|ios|android|react|python|rust|golang|java|typescript|deploy|release|infra|cto\b|expert|cli\b|refactor)/i],
]

const categoryOf = value => CATEGORY_WORDS.find(([, words]) => words.test(value))?.[0]

const ACRONYMS = new Map(['ai', 'api', 'ui', 'ux', 'qa', 'seo', 'sql', 'ml', 'llm', 'ios', 'aws', 'gcp', 'sre', 'cli', 'cto', 'ceo', 'cfo', 'coo', 'cmo', 'hr', 'mcp', 'rag', 'nlp', 'php', 'css', 'html', 'tdd', 'ci', 'cd', 'dx', 'gtm', 'b2b', 'saas', 'k8s', 'omp', 'acp', 'gdpr', 'ccpa', 'gsd', 'sdk', 'aws', 'url', 'json', 'pdf', 'cms', 'crm', 'erp', 'kpi', 'okr', 'a11y', 'i18n'].map(word => [word, word.toUpperCase()]))

for (const [word, written] of [['devops', 'DevOps'], ['graphql', 'GraphQL'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['nextjs', 'Next.js'], ['nodejs', 'Node.js'], ['postgresql', 'PostgreSQL'], ['mongodb', 'MongoDB'], ['fastapi', 'FastAPI'], ['github', 'GitHub'], ['gitlab', 'GitLab'], ['openai', 'OpenAI'], ['llms', 'LLMs'], ['apis', 'APIs'], ['dotnet', '.NET'], ['csharp', 'C#'], ['wordpress', 'WordPress'], ['openrouter', 'OpenRouter'], ['deepseek', 'DeepSeek']]) ACRONYMS.set(word, written)

const titleOf = slug => (/[A-Z ]/.test(slug) ? slug.trim() : slug.split(/[-_]+/).filter(Boolean).map(word => ACRONYMS.get(word) ?? `${word[0].toUpperCase()}${word.slice(1)}`).join(' '))

const companiesSite = `${COMPANIES}data/companies.json`

console.log('Roles from Paperclip companies')

const { companies } = await (await fetch(companiesSite)).json()

const roles = await each(companies.flatMap(company => company.agents.map(agent => ({ company, agent }))), async ({ company, agent }) => {
  const prefix = company.path === '.' ? '' : `${company.path}/`
  const file = `${prefix}agents/${agent.slug}/AGENTS.md`
  const pack = company.path === '.' ? company.repo : `${company.repo}/${company.path}`
  let source = ''

  try {
    source = await raw(company.repo, company.commit, file)
  } catch (error) {
    warn(error.message)
  }

  const { meta, body } = split(source)
  const title = agent.title && agent.title !== agent.name ? agent.title : ''
  const boss = company.agents.find(one => one.slug === agent.reportsTo)

  return {
    id: `${company.id}.${slugify(agent.slug)}`,
    kind: 'role',
    name: agent.name,
    title,
    description: summaryOf(body) || `${title || agent.name} at ${company.name}.`,
    category: categoryOf(`${agent.name} ${title}`) ?? company.category,
    repo: company.source?.repo ?? company.repo,
    from: { name: company.name, url: `${COMPANIES}companies/${company.id}/` },
    file: `https://github.com/${company.repo}/blob/${company.commit}/${file}`,
    license: company.license,
    skills: Array.isArray(meta?.skills) ? meta.skills.length : 0,
    reportsTo: boss?.name ?? null,
    teamSize: company.agents.length,
    paperclip: { how: 'import' },
    install: [
      { label: 'Add to a company you have', command: `npx companies.sh add ${pack} --target existing --agents ${agent.slug}` },
      { label: 'Or start a new company with it', command: `npx companies.sh add ${pack} --target new --agents ${agent.slug}` },
    ],
  }
}, 24)

console.log(`  ${roles.length} roles from ${companies.length} companies`)
console.log('Subagents from Claude Code collections')

const NOT_AN_AGENT = /(^|\/)(readme|claude|contributing|changelog|license|skill|agents|index|code_of_conduct|security)\.md$/i
const NOT_AGENT_FOLDERS = /(^|\/)(commands|skills|docs?|templates?|examples?|tests?|hooks|\.github)\//i

const subagents = []
const seenSubagents = new Set()

for (const collection of readJson('data/collections.json')) {
  const info = await api(`repos/${collection.repo}`)

  if (info === null || info.archived || !isOpen(info.license?.spdx_id)) {
    warn(`${collection.repo}: missing, archived or not openly licensed, left out`)
    continue
  }

  const { sha: commit } = await api(`repos/${collection.repo}/commits/HEAD`)
  const include = collection.include ? new RegExp(collection.include) : /(^|\/)agents\//
  const files = (await blobsAt(collection.repo, commit)).filter(path => /\.md$/i.test(path) && include.test(path) && !NOT_AN_AGENT.test(path) && !NOT_AGENT_FOLDERS.test(path))

  const read = await each(files, async path => {
    const { meta } = split(await raw(collection.repo, commit, path))
    const name = text(meta?.name)
    const description = shorten(plain(text(meta?.description)))

    if (name === '' || description.length < 20) return null

    const fileName = slugify(name) || slugify(path.split('/').at(-1).replace(/\.md$/i, ''))
    const tools = Array.isArray(meta.tools) ? meta.tools : text(meta.tools).split(',')

    return {
      id: `${slugify(collection.repo.replace('/', '-'))}.${fileName}`,
      kind: 'subagent',
      name: titleOf(name),
      description,
      category: categoryOf(name) ?? categoryOf(description) ?? collection.category,
      repo: info.full_name,
      from: { name: collection.name, url: `https://github.com/${info.full_name}` },
      file: `https://github.com/${info.full_name}/blob/${commit}/${path}`,
      license: info.license.spdx_id,
      model: text(meta.model) || null,
      tools: tools.map(text).filter(Boolean).length,
      paperclip: null,
      install: [
        { label: 'Add to Claude Code in this project', command: `curl -fsSL --create-dirs -o .claude/agents/${fileName}.md ${rawUrl(info.full_name, commit, path)}` },
        { label: 'Or for all your projects', command: `curl -fsSL --create-dirs -o ~/.claude/agents/${fileName}.md ${rawUrl(info.full_name, commit, path)}` },
      ],
    }
  }, 24)

  let kept = 0

  for (const agent of read.filter(Boolean)) {
    const key = `${agent.name.toLowerCase()}|${agent.description.slice(0, 80).toLowerCase()}`

    if (seenSubagents.has(key)) continue

    seenSubagents.add(key)
    subagents.push(agent)
    kept++
  }

  console.log(`  ${collection.repo}: ${kept} of ${files.length} files`)
}

console.log('Runtimes and frameworks')

const curated = (kind, list) => list.map(entry => ({
  id: entry.id,
  kind,
  name: entry.name,
  description: entry.description,
  category: entry.category ?? 'general',
  repo: entry.repo,
  url: entry.url ?? null,
  packages: { npm: entry.npm ?? null, pypi: entry.pypi ?? null },
  paperclip: entry.adapters ? { how: 'built-in', types: entry.adapters } : entry.community ? { how: 'community', packages: entry.community } : null,
  install: entry.install ? [{ label: 'Install', command: entry.install }] : [],
}))

const runtimes = curated('runtime', readJson('data/runtimes.json'))
const frameworks = curated('framework', readJson('data/frameworks.json'))

console.log('Paperclip adapters on npm')

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const npmJson = async (url, attempt = 1) => {
  const response = await fetch(url)

  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await pause(Math.max(Number(response.headers.get('retry-after')) * 1000 || 0, 5000 * attempt))

    return npmJson(url, attempt + 1)
  }

  return response.ok ? response.json() : null
}

const yesterday = new Date(Date.parse(today) - DAY)
const firstDay = new Date(yesterday.getTime() - (WEEKS * 7 - 1) * DAY)

const downloadsFrom = daily => {
  const at = day => daily.get(day) ?? 0
  const days = Array.from({ length: WEEKS * 7 }, (_, index) => dayOf(new Date(firstDay.getTime() + index * DAY)))
  const weekly = Array.from({ length: WEEKS }, (_, week) => days.slice(week * 7, week * 7 + 7).reduce((sum, day) => sum + at(day), 0))
  const last30 = days.slice(-30).reduce((sum, day) => sum + at(day), 0)
  const previous30 = days.slice(-60, -30).reduce((sum, day) => sum + at(day), 0)

  return { weekly, last30, previous30 }
}

const fromNpm = answer => (answer?.downloads ? { ...downloadsFrom(new Map(answer.downloads.map(({ day, downloads }) => [day, downloads]))), registry: 'npm' } : null)

// The downloads API limits requests hard; unscoped names go in batches, and only scoped names one at a time.
const npmDownloadsFor = async names => {
  const range = `https://api.npmjs.org/downloads/range/${dayOf(firstDay)}:${dayOf(yesterday)}`
  const result = new Map()
  const unscoped = names.filter(name => !name.startsWith('@'))

  for (let start = 0; start < unscoped.length; start += 100) {
    const batch = unscoped.slice(start, start + 100)
    const answer = await npmJson(`${range}/${batch.join(',')}`)

    if (batch.length === 1) result.set(batch[0], fromNpm(answer))
    else for (const name of batch) result.set(name, fromNpm(answer?.[name]))
    await pause(1000)
  }

  for (const name of names.filter(one => one.startsWith('@'))) {
    result.set(name, fromNpm(await npmJson(`${range}/${name}`)))
    await pause(1000)
  }

  return result
}

const pypiDownloads = async name => {
  const answer = await npmJson(`https://pypistats.org/api/packages/${name.toLowerCase()}/overall?mirrors=false`)

  return answer?.data ? downloadsFrom(new Map(answer.data.filter(row => row.category === 'without_mirrors').map(({ date, downloads }) => [date, downloads]))) : null
}

const searchNpm = async query => (await npmJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=250`))?.objects.map(object => object.package) ?? []

const hits = new Map()

for (const query of ['paperclip adapter', 'keywords:paperclip-adapter', 'keywords:paperclip', 'paperclipai adapter']) {
  for (const found of await searchNpm(query)) hits.set(found.name, found)
}

const githubRepoOf = url => /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?(?:[/#?]|$)/i.exec(url ?? '')?.[1] ?? null

const adapterName = name => {
  const [, scope] = /^@([^/]+)\//.exec(name) ?? []
  const words = name.replace(/^@[^/]+\//, '').split(/[-_.]+/).filter(word => !/^(paperclip|paperclipai|adapter|adapters|plugin|external)$/i.test(word))

  return titleOf(words.length > 0 ? words.join('-') : scope ?? name)
}

// Shared helper libraries and verbatim forks of the built-in adapters are not adapters you would pick.
const NOT_AN_ADAPTER = /^(shared (utilities|.*logic)|this document describes|a fork of)|\bfork of the paperclip adapter\b/i

const adapterCandidates = [...hits.values()].filter(found => {
  const about = `${found.name} ${found.description ?? ''} ${(found.keywords ?? []).join(' ')}`

  return /paperclip/i.test(about) && /adapter/i.test(`${found.name} ${found.description ?? ''}`) && !found.name.startsWith('@paperclipai/')
    && !NOT_AN_ADAPTER.test(found.description ?? '') && isEnglish(found.description ?? '')
})

const adapters = (await each(adapterCandidates, async found => {
  const packument = await npmJson(`https://registry.npmjs.org/${found.name.replace('/', '%2f')}`)

  if (packument === null) return null

  const latest = packument.versions?.[packument['dist-tags']?.latest]

  if (latest === undefined || latest.deprecated) return null

  const description = shorten(plain(text(packument.description ?? found.description)))

  return {
    id: `npm.${slugify(found.name)}`,
    kind: 'adapter',
    name: adapterName(found.name),
    description,
    category: categoryOf(description.replace(/paperclip|adapter/gi, '')) ?? 'general',
    repo: githubRepoOf(latest.repository?.url ?? packument.repository?.url),
    url: `https://www.npmjs.com/package/${found.name}`,
    license: text(latest.license ?? packument.license) || null,
    packages: { npm: found.name, pypi: null },
    published: { created: packument.time?.created ?? null, modified: packument.time?.[latest.version] ?? packument.time?.modified ?? null, version: latest.version },
    paperclip: { how: 'plugin', package: found.name },
    install: [{ label: 'In Paperclip: Settings → Adapters → Install from npm', command: found.name }],
  }
}, 4)).filter(Boolean)

console.log('  downloads from npm')

const npmDownloads = await npmDownloadsFor([...new Set([...adapters, ...runtimes, ...frameworks].map(entry => entry.packages.npm).filter(Boolean))])

for (const entry of [...adapters, ...runtimes, ...frameworks]) {
  if (!entry.packages.npm) continue
  entry.downloads = npmDownloads.get(entry.packages.npm) ?? null
  if (entry.downloads === null) warn(`npm ${entry.packages.npm}: no downloads`)
}

const adapterOf = new Map()

// Forks often keep the original's description word for word; the most-downloaded one stays.
for (const adapter of adapters.toSorted((a, b) => (b.downloads?.last30 ?? 0) - (a.downloads?.last30 ?? 0))) {
  const key = adapter.description.toLowerCase().slice(0, 60)

  if (!adapterOf.has(key)) adapterOf.set(key, adapter)
}

adapters.splice(0, adapters.length, ...adapterOf.values())

console.log(`  ${adapters.length} adapters from ${adapterCandidates.length} candidates`)

console.log('Top 100 rankings from GitHub search')

const rankings = readJson('data/rankings.json')
const projects = []
const RANKED = 100
const byRepo = new Map([...runtimes, ...frameworks, ...adapters].filter(entry => entry.repo).map(entry => [entry.repo.toLowerCase(), entry]))
const roleRepos = new Map(roles.map(role => [role.repo.toLowerCase(), role.from]))
const collectionRepos = new Set(subagents.map(agent => agent.repo.toLowerCase()))

for (const ranking of rankings) {
  let after = null

  for (let rank = 0; rank < RANKED;) {
    const data = await graphql(`{ search(query: ${JSON.stringify(`${ranking.query} stars:>0 sort:stars`)}, type: REPOSITORY, first: 50${after ? `, after: ${JSON.stringify(after)}` : ''}) {
      pageInfo { endCursor hasNextPage } nodes { ... on Repository { nameWithOwner description isFork } } } }`)

    for (const node of data.search.nodes) {
      rank++

      const key = node.nameWithOwner.toLowerCase()
      const known = byRepo.get(key)

      if (known) {
        (known.ranks ??= {})[ranking.id] = rank
        continue
      }

      const [, name] = node.nameWithOwner.split('/')
      const description = shorten(plain(text(node.description))) || 'No description on GitHub.'
      const entry = {
        id: `gh.${slugify(node.nameWithOwner.replace('/', '-'))}`,
        kind: 'project',
        name,
        description,
        category: categoryOf(name) ?? categoryOf(description.split(/[.!?] /)[0]) ?? 'general',
        repo: node.nameWithOwner,
        url: null,
        ranks: { [ranking.id]: rank },
        companyOf: roleRepos.get(key) ?? null,
        subagents: collectionRepos.has(key),
        paperclip: roleRepos.has(key) ? { how: 'company', company: roleRepos.get(key) } : null,
        install: [{ label: 'Clone', command: `git clone https://github.com/${node.nameWithOwner}` }],
      }

      byRepo.set(key, entry)
      projects.push(entry)
    }

    if (!data.search.pageInfo.hasNextPage) break
    after = data.search.pageInfo.endCursor
  }

  console.log(`  ${ranking.label}: top ${RANKED}`)
}

console.log(`  ${projects.length} projects not listed elsewhere`)

const all = [...roles, ...subagents, ...runtimes, ...adapters, ...frameworks, ...projects]

console.log('Downloads from PyPI')

for (const entry of all.filter(one => one.packages?.pypi)) {
  entry.downloads = await pypiDownloads(entry.packages.pypi)
  if (entry.downloads) entry.downloads.registry = 'PyPI'
  else warn(`PyPI ${entry.packages.pypi}: no downloads`)
  await pause(1200)
}

console.log('GitHub repositories')

const end = new Date(`${today}T00:00:00Z`)
const weeks = Array.from({ length: WEEKS }, (_, index) => ({
  since: new Date(end.getTime() - (WEEKS - index) * 7 * DAY).toISOString(),
  until: new Date(end.getTime() - (WEEKS - index - 1) * 7 * DAY).toISOString(),
}))

const FIELDS = `nameWithOwner stargazerCount forkCount createdAt pushedAt isArchived homepageUrl licenseInfo { spdxId } primaryLanguage { name }
  issues(states: OPEN) { totalCount } repositoryTopics(first: 20) { nodes { topic { name } } }
  defaultBranchRef { target { ... on Commit { ${weeks.map((week, index) => `w${index}: history(since: "${week.since}", until: "${week.until}") { totalCount }`).join(' ')} } } }`

const wanted = [...new Set(all.map(entry => entry.repo).filter(Boolean))]
const found = new Map()
const BATCH = 12

for (let start = 0; start < wanted.length; start += BATCH) {
  const batch = wanted.slice(start, start + BATCH)
  const data = await graphql(`{ ${batch.map((repo, index) => {
    const [owner, name] = repo.split('/')

    return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${FIELDS} }`
  }).join('\n')} }`)

  batch.forEach((repo, index) => {
    const answer = data[`r${index}`]

    if (answer) found.set(repo, answer)
  })
}

// Orgs with an IP allow list refuse the Actions token, so read them without one
for (const repo of wanted.filter(one => !found.has(one))) {
  const answer = await publicRepo(repo)

  if (!answer) {
    warn(`${repo}: not found on GitHub`)
    continue
  }

  found.set(repo, {
    nameWithOwner: answer.full_name,
    stargazerCount: answer.stargazers_count,
    forkCount: answer.forks_count,
    createdAt: answer.created_at,
    pushedAt: answer.pushed_at,
    isArchived: answer.archived,
    homepageUrl: answer.homepage,
    licenseInfo: answer.license && { spdxId: answer.license.spdx_id },
    primaryLanguage: answer.language && { name: answer.language },
    repositoryTopics: { nodes: (answer.topics ?? []).map(name => ({ topic: { name } })) },
  })
}

const history = existsSync(HISTORY) ? readJson(HISTORY) : {}
const repos = {}

for (const [asked, answer] of found) {
  const key = answer.nameWithOwner
  const snapshots = (history[key] ??= {})

  snapshots[today] = answer.stargazerCount

  const ageOf = day => Math.round((Date.parse(today) - Date.parse(day)) / DAY)
  const then = Object.keys(snapshots).filter(day => ageOf(day) >= 5 && ageOf(day) <= 31).sort()[0]
  const target = answer.defaultBranchRef?.target

  repos[key] = {
    stars: answer.stargazerCount,
    forks: answer.forkCount,
    created: answer.createdAt,
    pushed: answer.pushedAt,
    archived: answer.isArchived || undefined,
    homepage: answer.homepageUrl || undefined,
    license: answer.licenseInfo?.spdxId && answer.licenseInfo.spdxId !== 'NOASSERTION' ? answer.licenseInfo.spdxId : undefined,
    language: answer.primaryLanguage?.name,
    issues: answer.issues?.totalCount,
    topics: answer.repositoryTopics?.nodes.map(node => node.topic.name),
    commits: target ? weeks.map((_, index) => target[`w${index}`]?.totalCount ?? 0) : undefined,
    growth: then ? { gained: answer.stargazerCount - snapshots[then], days: ageOf(then), since: then } : undefined,
  }

  for (const entry of all) if (entry.repo === asked) entry.repo = key
}

for (const entry of all) if (entry.repo && repos[entry.repo] === undefined) entry.repo = null

const KEEP_DAYS = 400

for (const snapshots of Object.values(history)) {
  for (const day of Object.keys(snapshots)) if (Date.parse(today) - Date.parse(day) > KEEP_DAYS * DAY) delete snapshots[day]
}

const sortedHistory = Object.keys(history).sort((a, b) => a.localeCompare(b)).map(repo => `  ${JSON.stringify(repo)}: ${JSON.stringify(Object.fromEntries(Object.entries(history[repo]).sort()))}`)

writeFileSync(HISTORY, `{\n${sortedHistory.join(',\n')}\n}\n`)

const HOSTS = [
  ['claude-code', 'anthropics/claude-code', /claude[\s-]?code|\.claude\/|claude-plugin|claude-skills?/i],
  ['paperclip', 'paperclipai/paperclip', /paperclip/i],
  ['codex', 'openai/codex', /\bcodex\b/i],
  ['cursor', 'cursor/cursor', /\bcursor\b/i],
  ['gemini-cli', 'google-gemini/gemini-cli', /gemini[\s-]?cli/i],
  ['opencode', 'anomalyco/opencode', /\bopen[\s-]?code\b/i],
  ['copilot', 'github/copilot-cli', /copilot/i],
  ['openclaw', 'openclaw/openclaw', /openclaw/i],
]

const FIXED_HOSTS = { role: ['paperclip'], subagent: ['claude-code'], adapter: ['paperclip'] }

for (const entry of all) {
  const hosts = new Set(FIXED_HOSTS[entry.kind] ?? [])

  if (entry.paperclip) hosts.add('paperclip')
  if (entry.subagents) hosts.add('claude-code')

  if (entry.kind === 'project') {
    const about = `${entry.name} ${entry.description} ${(repos[entry.repo]?.topics ?? []).join(' ')}`

    for (const [host, home, words] of HOSTS) if (entry.repo !== home && words.test(about)) hosts.add(host)
  }

  entry.worksWith = HOSTS.map(([host]) => host).filter(host => hosts.has(host))
  delete entry.subagents
}

const ids = new Set()

for (const entry of all) {
  let id = entry.id

  for (let count = 2; ids.has(id); count++) id = `${entry.id}-${count}`

  entry.id = id
  ids.add(id)
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), repos, agents: all })}\n`)

const counts = Object.entries(Object.groupBy(all, entry => entry.kind)).map(([kind, list]) => `${list.length} ${kind}s`).join(', ')

console.log(`${all.length} agents written to ${outPath}: ${counts}, ${Object.keys(repos).length} repositories`)
