const $ = id => document.getElementById(id)

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag)

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'style') node.style.cssText = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value === true ? '' : value)
  }

  node.append(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false))

  return node
}

const SVG = 'http://www.w3.org/2000/svg'

const svg = (tag, attributes = {}, ...children) => {
  const node = document.createElementNS(SVG, tag)

  for (const [key, value] of Object.entries(attributes)) if (value !== undefined) node.setAttribute(key, value)
  node.append(...children)

  return node
}

const DAY = 86_400_000
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en')
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const shortDate = date => new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
const longDate = date => new Date(date).toLocaleDateString('en', { dateStyle: 'medium' })
const daysSince = date => (Date.now() - new Date(date).getTime()) / DAY

const ageOf = date => {
  const days = -Math.round(daysSince(date))

  if (days > -14) return relative.format(days, 'day')
  if (days > -60) return relative.format(Math.round(days / 7), 'week')
  if (days > -365) return relative.format(Math.round(days / 30), 'month')

  return relative.format(Math.round(days / 365), 'year')
}

const HOSTS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'paperclip', label: 'Paperclip' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'gemini-cli', label: 'Gemini CLI' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'copilot', label: 'Copilot' },
  { id: 'openclaw', label: 'OpenClaw' },
]

const ADAPTER_LABELS = {
  claude_local: 'Claude Code',
  codex_local: 'Codex',
  cursor: 'Cursor',
  cursor_cloud: 'Cursor Cloud',
  gemini_local: 'Gemini CLI',
  grok_local: 'Grok Build',
  hermes_local: 'Hermes Agent',
  hermes_gateway: 'Hermes Gateway',
  kimi_local: 'Kimi Code CLI',
  openclaw_gateway: 'OpenClaw Gateway',
  opencode_local: 'OpenCode',
  pi_local: 'Pi',
}

const LANGUAGES = {
  TypeScript: '#3178c6', JavaScript: '#e8c53a', Python: '#3572a5', Rust: '#dea584', Go: '#00add8', Shell: '#89e051',
  'C#': '#178600', Java: '#b07219', 'C++': '#f34b7d', C: '#555555', Ruby: '#701516', PHP: '#4f5d95', Swift: '#f05138',
  Kotlin: '#a97bff', Dart: '#00b4ab', HTML: '#e34c26', CSS: '#663399', Vue: '#41b883', Svelte: '#ff3e00', MDX: '#fcb32c',
  'Jupyter Notebook': '#da5b0b', Lua: '#000080', Zig: '#ec915c', Elixir: '#6e4a7e', Nix: '#7e7eff',
}

const PAGE = 50
const DEFAULTS = { kind: 'all', query: '', host: 'any', category: 'all', list: 'any', updated: 'any', sort: 'popular', descending: true }
const state = { ...DEFAULTS, open: null }
let shown = PAGE

const data = await fetch('data/agents.json').then(response => response.json())
const { agents, repos, kinds, categories, rankings } = data
const kindOf = Object.fromEntries(kinds.map(kind => [kind.id, kind]))
const categoryOf = Object.fromEntries(categories.map(category => [category.id, category]))
const byId = new Map(agents.map(agent => [agent.id, agent]))

const initialsOf = name => {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? ['?']
  const meaningful = words.filter(word => !/^(of|the|and|for|a|an)$/i.test(word))
  const used = meaningful.length > 0 ? meaningful : words

  return (used.length > 1 ? used.slice(0, 2).map(word => Array.from(word)[0]) : Array.from(used[0]).slice(0, 2)).join('').toLocaleUpperCase('en')
}

const hashOf = text => Array.from(text).reduce((hash, letter) => (hash * 31 + letter.codePointAt(0)) >>> 0, 7)

const GENERIC = /^(chief|ceo|cto|coo|cfo|cmo|cpo|cro|vp|vice|head|director|founder|president|general manager|board|orchestrator)\b/i
const sum = list => list.reduce((total, value) => total + value, 0)

const installOf = agent => {
  if (agent.install) return agent.install

  if (agent.kind === 'role') {
    const [, repo, , folder, slug] = /github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(?:(.*)\/)?agents\/([^/]+)\/AGENTS\.md$/.exec(agent.file) ?? []
    const pack = folder ? `${repo}/${folder}` : repo

    return [
      { label: 'Add it to a Paperclip company you have', command: `npx companies.sh add ${pack} --target existing --agents ${slug}` },
      { label: 'Or start a new company with it', command: `npx companies.sh add ${pack} --target new --agents ${slug}` },
    ]
  }

  if (agent.kind === 'subagent') {
    const raw = agent.file.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/')
    const file = decodeURIComponent(agent.file.split('/').at(-1))

    return [
      { label: 'Add it to Claude Code in this project', command: `curl -fsSL --create-dirs -o .claude/agents/${file} ${raw}` },
      { label: 'Or for all your projects', command: `curl -fsSL --create-dirs -o ~/.claude/agents/${file} ${raw}` },
    ]
  }

  return []
}

const groups = new Map()

for (const agent of agents) {
  const repo = repos[agent.repo] ?? null

  agent.r = repo
  agent.stars = repo?.stars ?? -1
  agent.forks = repo?.forks ?? -1
  agent.issues = repo?.issues ?? -1
  agent.lang = repo?.language ?? ''
  agent.activity = repo?.commits ? sum(repo.commits) : -1
  agent.growthRate = repo?.growth ? repo.growth.gained / repo.growth.days : -1
  agent.dl = agent.downloads?.last30 ?? -1
  agent.updatedAt = repo?.pushed ?? agent.published?.modified ?? ''
  agent.createdAt = repo?.created ?? agent.published?.created ?? ''
  agent.initials = initialsOf(agent.name)
  agent.haystack = [
    agent.name, agent.title, agent.description, agent.from?.name, agent.repo, agent.packages?.npm, agent.packages?.pypi,
    kindOf[agent.kind]?.one, categoryOf[agent.category]?.label, agent.lang, ...(repo?.topics ?? []),
    ...(agent.worksWith ?? []).map(host => HOSTS.find(one => one.id === host)?.label),
  ].filter(Boolean).join(' ').toLowerCase()

  const key = agent.repo ?? agent.id

  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(agent)
}

// One big project would otherwise fill the first pages, so Popular takes the best-known agent of each project before the second.
for (const group of groups.values()) {
  group
    .sort((a, b) => GENERIC.test(`${a.name} ${a.title ?? ''}`) - GENERIC.test(`${b.name} ${b.title ?? ''}`) || hashOf(a.id) - hashOf(b.id))
    .forEach((agent, index) => { agent.tier = index })
}

const SORTS = {
  popular: { label: 'Popular', compare: (a, b) => a.tier - b.tier || b.stars - a.stars || b.dl - a.dl },
  stars: { label: 'Most stars', value: agent => agent.stars, descending: true },
  growth: { label: 'Fastest growing', value: agent => agent.growthRate, descending: true },
  downloads: { label: 'Most downloaded', value: agent => agent.dl, descending: true },
  activity: { label: 'Most active', value: agent => agent.activity, descending: true },
  forks: { label: 'Most forks', value: agent => agent.forks, descending: true },
  issues: { label: 'Most open issues', value: agent => agent.issues, descending: true },
  updated: { label: 'Recently updated', value: agent => agent.updatedAt || -1, descending: true },
  created: { label: 'Newest', value: agent => agent.createdAt || -1, descending: true },
  name: { label: 'Name', value: agent => agent.name.toLowerCase(), descending: false },
  rank: { label: 'Rank in the list', value: agent => agent.ranks?.[state.list] ?? -1, descending: false },
}

const missing = value => value === -1 || value === ''

const sorter = () => {
  const sort = SORTS[state.sort]

  if (sort.compare) return sort.compare

  const direction = state.descending ? -1 : 1

  return (a, b) => {
    const [left, right] = [sort.value(a), sort.value(b)]

    if (missing(left) !== missing(right)) return missing(left) ? 1 : -1

    return (left < right ? -1 : left > right ? 1 : 0) * direction || b.stars - a.stars || a.name.localeCompare(b.name)
  }
}

const matches = (agent, filter, skip) => {
  if (skip !== 'kind' && filter.kind !== 'all' && agent.kind !== filter.kind) return false
  if (skip !== 'host' && filter.host !== 'any' && !agent.worksWith?.includes(filter.host)) return false
  if (skip !== 'category' && filter.category !== 'all' && agent.category !== filter.category) return false
  if (skip !== 'list' && filter.list !== 'any' && !agent.ranks?.[filter.list]) return false
  if (filter.updated !== 'any' && (!agent.updatedAt || daysSince(agent.updatedAt) > Number(filter.updated))) return false

  return filter.words.every(word => agent.haystack.includes(word))
}

const filterOf = () => ({ ...state, words: state.query.toLowerCase().split(/\s+/).filter(Boolean) })

const countBy = (skip, key) => {
  const filter = filterOf()
  const counts = new Map()

  for (const agent of agents) {
    if (!matches(agent, filter, skip)) continue
    for (const value of [].concat(key(agent) ?? [])) counts.set(value, (counts.get(value) ?? 0) + 1)
    counts.set('*', (counts.get('*') ?? 0) + 1)
  }

  return counts
}

const sparkline = (values, { width = 76, height = 24, title } = {}) => {
  const top = Math.max(...values, 1)
  const gap = 2
  const bar = (width - gap * (values.length - 1)) / values.length
  const chart = svg('svg', { class: 'spark', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': title })

  values.forEach((value, index) => {
    const tall = value === 0 ? 2 : Math.max(3, (value / top) * height)

    chart.append(svg('rect', { x: (index * (bar + gap)).toFixed(2), y: (height - tall).toFixed(2), width: bar.toFixed(2), height: tall.toFixed(2), rx: 1.2, class: value === 0 ? 'zero' : undefined }))
  })

  return chart
}

const kindStyle = kind => `--k: var(--k-${kind})`
const avatar = agent => el('span', { class: 'avatar', style: kindStyle(agent.kind), 'aria-hidden': 'true' }, agent.initials)
const hostChip = id => el('span', { class: 'host', style: `--h: var(--h-${id})` }, el('i'), HOSTS.find(host => host.id === id)?.label ?? id)
const none = (title = 'No data') => el('span', { class: 'none', title }, '—')

const fromLine = agent => {
  if (agent.kind === 'role') return [agent.title, agent.from.name].filter(Boolean).join(' · ')
  if (agent.kind === 'subagent') return `${agent.from.name} · ${agent.repo}`
  if (agent.kind === 'adapter') return agent.packages.npm
  return agent.repo ?? ''
}

const downloadChange = downloads => (downloads.previous30 > 0 ? Math.round(((downloads.last30 - downloads.previous30) / downloads.previous30) * 100) : null)

const growthCell = agent => {
  const growth = agent.r?.growth

  if (!growth) return none(agent.r ? `Growth shows once a snapshot from at least 5 days ago exists. Tracking started for ${agent.repo}.` : 'Not on GitHub')

  return el('span', { class: 'growth', title: `${whole.format(growth.gained)} stars since ${longDate(growth.since)}` },
    `${growth.gained >= 0 ? '+' : ''}${compact.format(growth.gained)}`, el('small', {}, `${growth.days} days`))
}

const COLUMNS = {
  rank: { label: '#', static: true, cell: (agent, index) => el('td', { class: 'rank' }, state.sort === 'rank' && agent.ranks?.[state.list] ? el('b', {}, String(agent.ranks[state.list])) : String(index + 1)) },
  agent: {
    label: 'Agent',
    sort: 'name',
    cell: agent => el('td', { class: 'cell-agent' },
      el('div', { class: 'agent' },
        avatar(agent),
        el('div', {},
          el('div', { class: 'agent-head' },
            el('a', { class: 'agent-name', href: `?agent=${encodeURIComponent(agent.id)}`, 'data-open': agent.id }, agent.name),
            state.kind === 'all' ? el('span', { class: 'kind-pill', style: kindStyle(agent.kind) }, kindOf[agent.kind].one) : null),
          el('div', { class: 'agent-from' }, fromLine(agent)),
          el('p', { class: 'agent-desc' }, agent.description),
          agent.worksWith?.length ? el('div', { class: 'hosts' }, agent.worksWith.map(hostChip)) : null))),
  },
  stars: {
    label: 'Stars',
    sort: 'stars',
    num: true,
    title: 'GitHub stars. For roles and subagents, the stars of the project they come from.',
    cell: agent => el('td', { class: 'num', 'data-label': 'Stars' }, agent.stars >= 0 ? el('span', { title: `${whole.format(agent.stars)} stars on ${agent.repo}` }, compact.format(agent.stars)) : none('Not on GitHub')),
  },
  growth: { label: 'Growth', sort: 'growth', num: true, title: 'Stars gained since our earliest snapshot in the past month', cell: agent => el('td', { class: 'num', 'data-label': 'Growth' }, growthCell(agent)) },
  downloads: {
    label: 'Downloads',
    sort: 'downloads',
    num: true,
    title: 'Downloads in the last 30 days on npm or PyPI, and the change against the 30 days before',
    cell: agent => {
      const downloads = agent.downloads
      const change = downloads ? downloadChange(downloads) : null

      return el('td', { class: 'num', 'data-label': 'Downloads' }, downloads
        ? [el('span', { title: `${whole.format(downloads.last30)} downloads of ${downloads.registry === 'npm' ? agent.packages?.npm : agent.packages?.pypi} on ${downloads.registry} in the last 30 days` }, compact.format(downloads.last30)),
            el('span', { class: 'sub' }, el('span', { class: 'registry' }, downloads.registry), change !== null ? el('span', { class: change > 0 ? 'trend-up' : '' }, ` ${change > 0 ? '+' : ''}${change}%`) : null)]
        : none('No package on npm or PyPI'))
    },
  },
  activity: {
    label: 'Activity',
    sort: 'activity',
    num: true,
    title: 'Commits per week on the default branch over the last 12 weeks',
    cell: agent => el('td', { class: 'num col-activity', 'data-label': 'Activity' }, agent.r?.commits ? el('span', { title: `${whole.format(agent.activity)} commits in 12 weeks` }, sparkline(agent.r.commits, { title: `${agent.activity} commits in 12 weeks` })) : none()),
  },
  forks: { label: 'Forks', sort: 'forks', num: true, cell: agent => el('td', { class: 'num col-forks', 'data-label': 'Forks' }, agent.forks >= 0 ? compact.format(agent.forks) : none()) },
  issues: { label: 'Issues', sort: 'issues', num: true, title: 'Open issues on GitHub', cell: agent => el('td', { class: 'num col-issues', 'data-label': 'Issues' }, agent.issues >= 0 ? compact.format(agent.issues) : none()) },
  lang: { label: 'Language', static: true, cls: 'col-lang', cell: agent => el('td', { class: 'lang col-lang', 'data-label': 'Language' }, agent.lang ? [el('span', { class: 'lang-dot', style: `--lang: ${LANGUAGES[agent.lang] ?? 'var(--muted)'}` }), agent.lang] : none()) },
  updated: { label: 'Updated', sort: 'updated', num: true, title: 'Last push to the repository, or the last release on npm', cell: agent => el('td', { class: 'num', 'data-label': 'Updated' }, agent.updatedAt ? el('span', { title: longDate(agent.updatedAt) }, ageOf(agent.updatedAt)) : none()) },
}

const PACKAGED = new Set(['runtime', 'adapter', 'framework'])
const columnsFor = kind => (PACKAGED.has(kind)
  ? ['rank', 'agent', 'stars', 'growth', 'downloads', 'activity', 'forks', 'lang', 'updated']
  : kind === 'all'
    ? ['rank', 'agent', 'stars', 'growth', 'downloads', 'activity', 'forks', 'issues', 'lang', 'updated']
    : ['rank', 'agent', 'stars', 'growth', 'activity', 'forks', 'issues', 'lang', 'updated'])

const sortBy = id => {
  const sort = SORTS[id]

  state.descending = state.sort === id ? !state.descending : Boolean(sort.descending)
  state.sort = id
  shown = PAGE
  render()
}

const renderHead = () => {
  $('head').replaceChildren(...columnsFor(state.kind).map(id => {
    const column = COLUMNS[id]
    const classes = [column.num ? 'num' : '', `col-${id}`].filter(Boolean).join(' ')

    if (column.static) return el('th', { scope: 'col', class: `${classes} static` }, column.label)

    const active = state.sort === column.sort

    return el('th', { scope: 'col', class: classes, title: column.title, 'aria-sort': active ? (state.descending ? 'descending' : 'ascending') : undefined },
      el('button', { type: 'button', onclick: () => sortBy(column.sort) }, column.label, el('span', { class: 'arrow', 'aria-hidden': 'true' }, active ? (state.descending ? '↓' : '↑') : '')))
  }))
}

const renderKinds = () => {
  const counts = countBy('kind', agent => agent.kind)
  const tabs = [{ id: 'all', label: 'All', description: 'Everything in one ranking. Pick a kind to compare like with like.' }, ...kinds]

  $('kinds').replaceChildren(...tabs.map(kind => el('button', {
    class: 'kind-tab',
    type: 'button',
    'aria-current': String(state.kind === kind.id),
    onclick: () => {
      state.kind = kind.id
      if (state.sort === 'downloads' && !PACKAGED.has(kind.id) && kind.id !== 'all') state.sort = 'popular'
      shown = PAGE
      render()
    },
  }, kind.id === 'all' ? null : el('span', { class: 'swatch', style: kindStyle(kind.id) }), kind.label, el('small', {}, whole.format(counts.get(kind.id === 'all' ? '*' : kind.id) ?? 0)))))

  $('kind-note').textContent = tabs.find(kind => kind.id === state.kind).description

  const strip = $('kinds')
  const active = strip.querySelector('[aria-current="true"]')

  if (active.offsetLeft < strip.scrollLeft || active.offsetLeft + active.offsetWidth > strip.scrollLeft + strip.clientWidth) {
    strip.scrollTo({ left: active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2 })
  }
}

const renderHosts = () => {
  const counts = countBy('host', agent => agent.worksWith)
  const chip = (id, label) => el('button', {
    class: 'host-chip',
    type: 'button',
    style: id === 'any' ? undefined : `--h: var(--h-${id})`,
    'aria-pressed': String(state.host === id),
    disabled: id !== 'any' && state.host !== id && !counts.get(id),
    onclick: () => {
      state.host = state.host === id ? 'any' : id
      shown = PAGE
      render()
    },
  }, id === 'any' ? null : el('span', { class: 'dot' }), label, el('small', {}, whole.format(counts.get(id === 'any' ? '*' : id) ?? 0)))

  $('runs').replaceChildren(chip('any', 'Anywhere'), ...HOSTS.map(host => chip(host.id, host.label)))
}

const fillSelect = (select, options, value) => {
  select.replaceChildren(...options.map(option => el('option', { value: option.value }, option.label)))
  select.value = value
  select.closest('.pick').classList.toggle('is-set', !['all', 'any', 'popular'].includes(value))
}

const renderPickers = () => {
  const categoryCounts = countBy('category', agent => agent.category)
  const listCounts = countBy('list', agent => Object.keys(agent.ranks ?? {}))

  fillSelect($('category'), [
    { value: 'all', label: `All (${whole.format(categoryCounts.get('*') ?? 0)})` },
    ...categories.map(category => ({ value: category.id, label: `${category.label} (${whole.format(categoryCounts.get(category.id) ?? 0)})` })),
  ], state.category)

  fillSelect($('list'), [
    { value: 'any', label: 'Any' },
    ...rankings.map(ranking => ({ value: ranking.id, label: `${ranking.label} (${listCounts.get(ranking.id) ?? 0})` })),
  ], state.list)

  const sorts = Object.entries(SORTS).filter(([id]) => (id !== 'rank' || state.list !== 'any') && (id !== 'downloads' || state.kind === 'all' || PACKAGED.has(state.kind)))

  fillSelect($('sort'), sorts.map(([id, sort]) => ({ value: id, label: sort.label })), state.sort)
  $('updated').value = state.updated
  $('updated').closest('.pick').classList.toggle('is-set', state.updated !== 'any')
}

const isFiltered = () => state.query !== '' || state.host !== 'any' || state.category !== 'all' || state.list !== 'any' || state.updated !== 'any' || state.kind !== 'all'

const reset = () => {
  Object.assign(state, DEFAULTS)
  $('search').value = ''
  shown = PAGE
  render()
}

const emptyRow = count => el('tr', {}, el('td', { class: 'empty', colspan: String(count) },
  el('h2', {}, 'No agent matches all of this'),
  el('p', {}, 'Try fewer words, another place it runs in, or clear the filters.'),
  el('button', { class: 'button primary', type: 'button', onclick: reset }, 'Clear filters')))

let list = []

const renderRows = () => {
  const columns = columnsFor(state.kind)
  const rows = list.slice(0, shown).map((agent, index) => el('tr', { 'data-id': agent.id, class: state.open === agent.id ? 'is-open' : undefined }, columns.map(id => COLUMNS[id].cell(agent, index))))

  $('rows').replaceChildren(...(rows.length > 0 ? rows : [emptyRow(columns.length)]))

  const left = list.length - shown

  $('more').hidden = left <= 0
  $('more').textContent = `Show ${Math.min(PAGE, left)} more of ${whole.format(left)}`
}

const syncUrl = () => {
  const params = new URLSearchParams()

  if (state.kind !== DEFAULTS.kind) params.set('kind', state.kind)
  if (state.query) params.set('q', state.query)
  if (state.host !== DEFAULTS.host) params.set('runs', state.host)
  if (state.category !== DEFAULTS.category) params.set('category', state.category)
  if (state.list !== DEFAULTS.list) params.set('list', state.list)
  if (state.updated !== DEFAULTS.updated) params.set('updated', state.updated)
  const listDefault = state.list !== 'any' && state.sort === 'rank' && !state.descending

  if (!listDefault && (state.sort !== DEFAULTS.sort || (SORTS[state.sort].value && state.descending !== Boolean(SORTS[state.sort].descending)))) params.set('sort',`${state.descending && SORTS[state.sort].value ? '-' : ''}${state.sort}`)
  if (state.open) params.set('agent', state.open)

  const query = params.toString()

  return `${location.pathname}${query ? `?${query}` : ''}`
}

const render = () => {
  if (state.list === 'any' && state.sort === 'rank') state.sort = 'popular'

  const filter = filterOf()

  list = agents.filter(agent => matches(agent, filter)).sort(sorter())
  renderKinds()
  renderHosts()
  renderPickers()
  renderHead()
  renderRows()

  const scope = state.kind === 'all' ? 'agents' : kindOf[state.kind].label.toLowerCase()

  $('count').replaceChildren(el('strong', {}, whole.format(list.length)), ` ${list.length === 1 ? scope.replace(/s$/, '') : scope}${list.length < agents.length && state.kind === 'all' ? ` of ${whole.format(agents.length)}` : ''}${state.sort !== 'popular' ? `, by ${SORTS[state.sort].label.toLowerCase()}` : ''}`)
  $('reset').hidden = !isFiltered()
  history.replaceState(history.state, '', syncUrl())
}

const copyButton = text => el('button', {
  class: 'copy',
  type: 'button',
  onclick: async event => {
    const button = event.currentTarget

    try {
      await navigator.clipboard.writeText(text)
      button.textContent = 'Copied'
      button.classList.add('done')
    } catch {
      button.textContent = 'Ctrl+C'
    }

    setTimeout(() => {
      button.textContent = 'Copy'
      button.classList.remove('done')
    }, 1600)
  },
}, 'Copy')

const codeBlock = (label, command) => el('div', {},
  label ? el('p', { class: 'step-label' }, label) : null,
  el('div', { class: 'code' }, el('code', {}, command), copyButton(command)))

const barChart = (title, values, total, startLabel) => {
  const width = 480
  const height = 72
  const gap = 6
  const bar = (width - gap * (values.length - 1)) / values.length
  const top = Math.max(...values, 1)
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `${title}: ${values.join(', ')}` })

  values.forEach((value, index) => {
    const tall = value === 0 ? 2 : Math.max(3, (value / top) * (height - 4))

    chart.append(svg('rect', { x: index * (bar + gap), y: height - tall, width: bar, height: tall, rx: 3, opacity: value === 0 ? 0.25 : 0.35 + 0.65 * (index + 1) / values.length },
      svg('title', {}, `${whole.format(value)}`)))
  })

  return el('div', { class: 'chart' },
    el('div', { class: 'chart-head' }, el('span', {}, title), el('strong', {}, total)),
    chart,
    el('div', { class: 'chart-axis' }, el('span', {}, startLabel), el('span', {}, 'this week')))
}

const stat = (label, value, sub) => el('div', { class: 'stat' }, el('dt', {}, label), el('dd', {}, value ?? '—', sub ? el('small', {}, ` ${sub}`) : null))

const openAgent = id => {
  state.open = id
  history.pushState({ drawer: true }, '', syncUrl())
  showDrawer()
}

const useSection = agent => {
  const parts = []
  const steps = installOf(agent)

  if (agent.kind === 'role') {
    parts.push(el('p', { class: 'note' }, 'Imports straight into ', el('strong', {}, 'Paperclip'), `. ${agent.reportsTo ? `Reports to the ${agent.reportsTo}` : 'Leads its company'}, one of ${agent.teamSize} agents in `, el('a', { href: agent.from.url }, agent.from.name), '. Add ', el('code', {}, '--dry-run'), ' to preview first.'))
  }

  if (agent.kind === 'subagent') {
    parts.push(el('p', { class: 'note' }, el('strong', {}, 'Claude Code'), ' loads every file in ', el('code', {}, '.claude/agents'), '. Start a new session or run ', el('code', {}, '/agents'), ' to use it.'))
  }

  if (agent.kind === 'adapter') {
    parts.push(el('p', { class: 'note' }, 'In ', el('strong', {}, 'Paperclip'), ', open Settings → Adapters → Install from npm and enter this package. Then pick it when you hire an agent.'))
    parts.push(codeBlock(null, agent.packages.npm))
  }

  if (agent.paperclip?.how === 'built-in') {
    parts.push(el('p', { class: 'note' }, 'Built into ', el('strong', {}, 'Paperclip'), ': choose ', agent.paperclip.types.flatMap((type, index) => [index > 0 ? ' or ' : '', el('strong', {}, ADAPTER_LABELS[type] ?? type), ' (', el('code', {}, type), ')']), ' as the adapter when you hire an agent.'))
  }

  if (agent.paperclip?.how === 'community') {
    const adapters = agent.paperclip.packages.map(name => agents.find(one => one.kind === 'adapter' && one.packages.npm === name))

    parts.push(el('p', { class: 'note' }, 'Runs in ', el('strong', {}, 'Paperclip'), ' through a community adapter:'))
    parts.push(el('div', { class: 'related' }, adapters.filter(Boolean).map(relatedButton)))
  }

  if (agent.paperclip?.how === 'company') {
    parts.push(el('p', { class: 'note' }, 'Ready for ', el('strong', {}, 'Paperclip'), ' as a whole company: ', el('a', { href: agent.paperclip.company.url }, agent.paperclip.company.name), '. Its roles are under Roles.'))
  }

  if (agent.kind !== 'adapter') for (const step of steps) parts.push(codeBlock(step.label, step.command))

  return parts.length > 0 ? el('section', { class: 'd-section' }, el('h3', {}, 'Use it'), el('div', { class: 'steps' }, parts)) : null
}

const relatedButton = agent => el('button', { type: 'button', onclick: () => openAgent(agent.id) },
  avatar(agent),
  el('span', {}, el('b', {}, agent.name), el('span', {}, agent.title || agent.description)),
  el('em', {}, agent.stars >= 0 ? `★ ${compact.format(agent.stars)}` : agent.dl >= 0 ? `${compact.format(agent.dl)}/mo` : ''))

const linksOf = agent => [
  agent.file ? ['Source file', agent.file] : null,
  agent.repo ? ['Repository', `https://github.com/${agent.repo}`] : null,
  agent.kind === 'role' ? ['Company', agent.from.url] : null,
  agent.packages?.npm ? ['npm', `https://www.npmjs.com/package/${agent.packages.npm}`] : null,
  agent.packages?.pypi ? ['PyPI', `https://pypi.org/project/${agent.packages.pypi}/`] : null,
  agent.url && !agent.url.includes('npmjs.com') ? ['Website', agent.url] : agent.r?.homepage ? ['Website', agent.r.homepage] : null,
].filter(Boolean)

const renderDrawer = agent => {
  const repo = agent.r
  const growth = repo?.growth
  const change = agent.downloads ? downloadChange(agent.downloads) : null
  const weeksAgo = new Date(Date.now() - 12 * 7 * DAY)
  const siblings = (groups.get(agent.repo ?? agent.id) ?? []).filter(one => one !== agent).sort((a, b) => a.tier - b.tier).slice(0, 6)
  const ranked = Object.entries(agent.ranks ?? {})

  return [
    el('header', { class: 'd-head' },
      avatar(agent),
      el('div', {},
        el('span', { class: 'kind-pill', style: kindStyle(agent.kind) }, kindOf[agent.kind].one),
        el('h2', { id: 'drawer-title' }, agent.name),
        el('div', { class: 'd-sub' }, agent.kind === 'role' ? [agent.title ? `${agent.title} at ` : 'At ', el('a', { href: agent.from.url }, agent.from.name)] : fromLine(agent))),
      el('button', { class: 'd-close', type: 'button', 'aria-label': 'Close', onclick: closeDrawer },
        el('span', { 'aria-hidden': 'true', style: 'font-size:20px;line-height:1' }, '×'))),
    el('div', { class: 'd-body' },
      el('div', {},
        el('p', { class: 'd-desc' }, agent.description),
        el('div', { class: 'd-tags' },
          el('span', { class: 'host', style: 'border-style:dashed' }, categoryOf[agent.category]?.label ?? agent.category),
          (agent.worksWith ?? []).map(hostChip))),
      useSection(agent),
      ranked.length > 0 ? el('section', { class: 'd-section' }, el('h3', {}, 'Top 100 on GitHub'),
        el('div', { class: 'ranks' }, ranked.map(([id, rank]) => el('span', { class: 'rank-badge' }, el('b', {}, `#${rank}`), `in ${rankings.find(ranking => ranking.id === id)?.label ?? id}`)))) : null,
      el('section', { class: 'd-section' }, el('h3', {}, 'Numbers'),
        el('dl', { class: 'stats' },
          stat('Stars', agent.stars >= 0 ? whole.format(agent.stars) : null),
          stat('Growth', growth ? `${growth.gained >= 0 ? '+' : ''}${whole.format(growth.gained)}` : null, growth ? `since ${shortDate(growth.since)}` : null),
          agent.downloads ? stat('Downloads', compact.format(agent.downloads.last30), change !== null ? `${change > 0 ? '+' : ''}${change}% · 30 days` : '30 days') : stat('Forks', agent.forks >= 0 ? whole.format(agent.forks) : null),
          stat('Open issues', agent.issues >= 0 ? whole.format(agent.issues) : null),
          stat('Language', agent.lang || null),
          stat('License', agent.license || repo?.license || null),
          stat('Created', agent.createdAt ? longDate(agent.createdAt) : null),
          stat('Last update', agent.updatedAt ? ageOf(agent.updatedAt) : null),
          agent.kind === 'role' ? stat('Skills', String(agent.skills)) : agent.kind === 'subagent' ? stat('Model', agent.model || 'inherit') : stat('Forks', agent.downloads && agent.forks >= 0 ? whole.format(agent.forks) : null))),
      repo?.commits || agent.downloads ? el('section', { class: 'd-section' }, el('h3', {}, 'Last 12 weeks'),
        el('div', { class: 'charts' },
          repo?.commits ? barChart('Commits per week', repo.commits, `${whole.format(agent.activity)} commits`, shortDate(weeksAgo)) : null,
          agent.downloads ? barChart(`Downloads per week on ${agent.downloads.registry}`, agent.downloads.weekly, `${compact.format(sum(agent.downloads.weekly))} total`, shortDate(weeksAgo)) : null)) : null,
      el('section', { class: 'd-section' }, el('h3', {}, 'Links'), el('div', { class: 'links' }, linksOf(agent).map(([label, href]) => el('a', { href, rel: 'noopener', target: '_blank' }, label, el('span', { 'aria-hidden': 'true' }, '↗'))))),
      siblings.length > 0 ? el('section', { class: 'd-section' }, el('h3', {}, `More from ${agent.from?.name ?? agent.repo}`), el('div', { class: 'related' }, siblings.map(relatedButton))) : null),
  ]
}

let returnFocus = null

const showDrawer = () => {
  const agent = byId.get(state.open)
  const drawer = $('drawer')

  if (!agent) {
    hideDrawer()
    return
  }

  if (drawer.hidden) returnFocus = document.activeElement
  drawer.replaceChildren(...renderDrawer(agent))
  drawer.scrollTop = 0
  drawer.hidden = false
  $('scrim').hidden = false
  document.body.style.overflow = 'hidden'
  requestAnimationFrame(() => {
    drawer.classList.add('is-in')
    $('scrim').classList.add('is-in')
  })
  drawer.focus({ preventScroll: true })
  document.title = `${agent.name} · Awesome Agents`

  for (const row of document.querySelectorAll('#rows tr')) row.classList.toggle('is-open', row.dataset.id === agent.id)
}

const hideDrawer = () => {
  const drawer = $('drawer')

  drawer.classList.remove('is-in')
  $('scrim').classList.remove('is-in')
  document.body.style.overflow = ''
  document.title = 'Awesome Agents: Every AI Agent, Ranked and Ready to Use'
  for (const row of document.querySelectorAll('#rows tr.is-open')) row.classList.remove('is-open')
  setTimeout(() => {
    if (!drawer.classList.contains('is-in')) {
      drawer.hidden = true
      $('scrim').hidden = true
    }
  }, 220)
  returnFocus?.focus?.({ preventScroll: true })
  returnFocus = null
}

function closeDrawer() {
  if (history.state?.drawer) {
    history.back()
    return
  }

  state.open = null
  history.replaceState(null, '', syncUrl())
  hideDrawer()
}

const readUrl = () => {
  const params = new URLSearchParams(location.search)
  const sort = params.get('sort') ?? ''
  const id = sort.replace(/^-/, '')

  Object.assign(state, DEFAULTS, { open: null })
  if (params.get('kind') in kindOf) state.kind = params.get('kind')
  if (HOSTS.some(host => host.id === params.get('runs'))) state.host = params.get('runs')
  if (params.get('category') in categoryOf) state.category = params.get('category')
  if (rankings.some(ranking => ranking.id === params.get('list'))) state.list = params.get('list')
  if (['7', '30', '365'].includes(params.get('updated'))) state.updated = params.get('updated')
  state.query = params.get('q') ?? ''

  if (id in SORTS) {
    state.sort = id
    state.descending = SORTS[id].value ? sort.startsWith('-') : true
  } else if (state.list !== 'any') {
    state.sort = 'rank'
    state.descending = false
  }

  if (byId.has(params.get('agent'))) state.open = params.get('agent')
  $('search').value = state.query
}

const setupTheme = () => {
  $('theme').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = current === 'dark' ? 'light' : 'dark'

    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {}
  })
}

setupTheme()

const repoCount = Object.keys(repos).length

$('eyebrow').replaceChildren(el('span', { class: 'dot', 'aria-hidden': 'true' }), `Updated ${longDate(data.generatedAt)} · ${whole.format(agents.length)} agents from ${whole.format(repoCount)} repositories`)
$('generated').textContent = `Data from ${longDate(data.generatedAt)}.`

$('search').addEventListener('input', event => {
  state.query = event.target.value.trim()
  shown = PAGE
  render()
})

$('category').addEventListener('change', event => {
  state.category = event.target.value
  shown = PAGE
  render()
})

$('list').addEventListener('change', event => {
  state.list = event.target.value

  if (state.list !== 'any') {
    state.sort = 'rank'
    state.descending = false
  }

  shown = PAGE
  render()
})

$('updated').addEventListener('change', event => {
  state.updated = event.target.value
  shown = PAGE
  render()
})

$('sort').addEventListener('change', event => {
  state.sort = event.target.value
  state.descending = Boolean(SORTS[state.sort].descending ?? true)
  shown = PAGE
  render()
})

$('reset').addEventListener('click', reset)

$('more').addEventListener('click', () => {
  shown += PAGE
  renderRows()
})

$('rows').addEventListener('click', event => {
  const link = event.target.closest('a[data-open]')

  if (link && (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1)) return

  const row = event.target.closest('tr[data-id]')

  if (!row || (event.target.closest('a') && !link)) return

  event.preventDefault()
  openAgent(row.dataset.id)
})

$('scrim').addEventListener('click', closeDrawer)

addEventListener('popstate', () => {
  readUrl()
  render()
  if (state.open) showDrawer()
  else if (!$('drawer').hidden) hideDrawer()
})

addEventListener('keydown', event => {
  const drawerOpen = !$('drawer').hidden

  if (event.key === 'Escape' && drawerOpen) {
    event.preventDefault()
    closeDrawer()
    return
  }

  if (event.key === 'Tab' && drawerOpen) {
    const focusable = [...$('drawer').querySelectorAll('a[href], button:not([disabled])')]
    const [first, last] = [focusable[0], focusable.at(-1)]

    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('drawer'))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }

    return
  }

  if (event.key === '/' && !drawerOpen && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    event.preventDefault()
    $('search').focus()
    $('search').select()
  }
})

new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting) && shown < list.length && shown < PAGE * 6) {
    shown += PAGE
    renderRows()
  }
}, { rootMargin: '600px' }).observe($('more'))

readUrl()
render()
if (state.open) showDrawer()
