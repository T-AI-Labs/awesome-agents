import { readFileSync, writeFileSync } from 'node:fs'

const SITE = 'https://t-ai-labs.github.io/awesome-agents/'
const REPO = 'https://github.com/T-AI-Labs/awesome-agents'

const [agentsPath = 'results/agents.json'] = process.argv.slice(2)
const { generatedAt, repos, agents } = JSON.parse(readFileSync(agentsPath, 'utf8'))

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const cell = text => String(text ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim()
const short = (text, max = 110) => (text.length > max ? `${text.slice(0, text.lastIndexOf(' ', max))}…` : text)
const starsOf = agent => repos[agent.repo]?.stars ?? -1
const growthOf = agent => {
  const growth = repos[agent.repo]?.growth

  return growth ? `+${compact.format(growth.gained)} in ${growth.days}d` : '–'
}
const dayOf = date => (date ? date.slice(0, 10) : '–')
const link = agent => (agent.repo ? `[${cell(agent.name)}](https://github.com/${agent.repo})` : `[${cell(agent.name)}](${agent.url})`)
const count = kind => agents.filter(agent => agent.kind === kind).length

const PAPERCLIP = { 'built-in': 'built-in adapter', community: 'community adapter', plugin: 'adapter plugin', company: 'as a company', import: 'import' }

const table = (header, rows) => [
  `| ${header.join(' | ')} |`,
  `| ${header.map((_, index) => (index === 0 || index > 1 && index < header.length - 2 ? '---:' : ':---')).join(' | ')} |`,
  ...rows.map(row => `| ${row.join(' | ')} |`),
].join('\n')

const byStars = kind => agents.filter(agent => agent.kind === kind).sort((a, b) => starsOf(b) - starsOf(a))

const runtimes = table(['#', 'Runtime', 'Stars', 'Growth', 'Downloads / 30d', 'Paperclip', 'Description', 'Last commit'], byStars('runtime').map((agent, index) => [
  index + 1, link(agent), compact.format(starsOf(agent)), growthOf(agent), agent.downloads ? compact.format(agent.downloads.last30) : '–',
  agent.paperclip ? PAPERCLIP[agent.paperclip.how] : '–', cell(short(agent.description)), dayOf(repos[agent.repo]?.pushed),
]))

const frameworks = table(['#', 'Framework', 'Stars', 'Growth', 'Downloads / 30d', 'Language', 'Description', 'Last commit'], byStars('framework').map((agent, index) => [
  index + 1, link(agent), compact.format(starsOf(agent)), growthOf(agent), agent.downloads ? compact.format(agent.downloads.last30) : '–',
  repos[agent.repo]?.language ?? '–', cell(short(agent.description)), dayOf(repos[agent.repo]?.pushed),
]))

const adapters = table(['#', 'Adapter', 'Package', 'Downloads / 30d', 'Description', 'Released'], agents
  .filter(agent => agent.kind === 'adapter')
  .sort((a, b) => (b.downloads?.last30 ?? 0) - (a.downloads?.last30 ?? 0))
  .slice(0, 20)
  .map((agent, index) => [index + 1, cell(agent.name), `[\`${agent.packages.npm}\`](${agent.url})`, compact.format(agent.downloads?.last30 ?? 0), cell(short(agent.description, 90)), dayOf(agent.published?.modified)]))

const HOST_LABELS = { 'claude-code': 'Claude Code', paperclip: 'Paperclip', codex: 'Codex', cursor: 'Cursor', 'gemini-cli': 'Gemini CLI', opencode: 'OpenCode', copilot: 'Copilot', openclaw: 'OpenClaw' }

const projects = table(['#', 'Project', 'Stars', 'Forks', 'Language', 'Open issues', 'Runs in', 'Description', 'Last commit'], byStars('project').slice(0, 30).map((agent, index) => {
  const repo = repos[agent.repo] ?? {}

  return [index + 1, link(agent), compact.format(repo.stars ?? 0), compact.format(repo.forks ?? 0), repo.language ?? '–', compact.format(repo.issues ?? 0),
    (agent.worksWith ?? []).map(host => HOST_LABELS[host]).join(', ') || '–', cell(short(agent.description, 90)), dayOf(repo.pushed)]
}))

const collections = Object.values(Object.groupBy(agents.filter(agent => agent.kind === 'subagent'), agent => agent.repo))
  .sort((a, b) => starsOf(b[0]) - starsOf(a[0]))
  .map(group => `- [${group[0].from.name}](https://github.com/${group[0].repo}): ${group.length} subagents, ★ ${compact.format(starsOf(group[0]))}`)

const companies = Object.values(Object.groupBy(agents.filter(agent => agent.kind === 'role'), agent => agent.from.url))
  .sort((a, b) => starsOf(b[0]) - starsOf(a[0]) || b.length - a.length)
  .slice(0, 12)
  .map(group => `- [${group[0].from.name}](${group[0].from.url}): ${group.length} roles${starsOf(group[0]) >= 0 ? `, ★ ${compact.format(starsOf(group[0]))}` : ''}`)

const date = new Date(generatedAt).toLocaleDateString('en', { dateStyle: 'long' })

const readme = `<div align="center">

<a href="${SITE}"><img src="site/favicon.svg" width="72" height="72" alt=""></a>

# Awesome Agents

**Every AI agent, ranked.**<br>
${agents.length.toLocaleString('en')} roles, subagents, runtimes, adapters, frameworks and top projects, filterable by where they run and sorted by stars, growth and activity.

[![Agents](https://img.shields.io/badge/agents-${agents.length}-0f766e)](${SITE})
[![Updated weekly](https://img.shields.io/badge/updated-weekly-0f766e)](#how-it-works)
[![License: MIT](https://img.shields.io/badge/license-MIT-555)](LICENSE)

### [Browse all ${agents.length.toLocaleString('en')} agents →](${SITE})

[Runs in Claude Code](${SITE}?runs=claude-code) &nbsp;·&nbsp; [Runs in Paperclip](${SITE}?runs=paperclip) &nbsp;·&nbsp; [Runtimes](#runtimes) &nbsp;·&nbsp; [Adapters](#paperclip-adapters) &nbsp;·&nbsp; [Frameworks](#frameworks) &nbsp;·&nbsp; [Top projects](#top-projects)

</div>

## What is in here

| Kind | Count | What it is | How you use it |
| :--- | ---: | :--- | :--- |
| [Roles](${SITE}?kind=role) | ${count('role')} | Agents with a job, from import-tested Paperclip companies | \`npx companies.sh add <company> --target existing --agents <role>\` |
| [Subagents](${SITE}?kind=subagent) | ${count('subagent')} | Specialist agent files for Claude Code | Save the file to \`.claude/agents/\` |
| [Runtimes](${SITE}?kind=runtime) | ${count('runtime')} | Coding CLIs and assistants you run | Install it; many run Paperclip employees through an adapter |
| [Adapters](${SITE}?kind=adapter) | ${count('adapter')} | Community plugins that bring more runtimes to Paperclip | Paperclip → Settings → Adapters → Install from npm |
| [Frameworks](${SITE}?kind=framework) | ${count('framework')} | Libraries for building your own agents | \`pip install\` or \`npm install\` |
| [Projects](${SITE}?kind=project) | ${count('project')} | The top 100 GitHub repositories for AI Agents, Claude, Claude Code and Paperclip | Read the project |

Every entry on the site has its command ready to copy.

## Runtimes

${runtimes}

## Paperclip adapters

The 20 most downloaded community adapters on npm. [See all ${count('adapter')} →](${SITE}?kind=adapter&sort=-downloads)

${adapters}

## Frameworks

${frameworks}

## Top projects

The most-starred projects from GitHub's top 100 searches for AI Agents, Claude, Claude Code and Paperclip that are not listed above. [See all ${count('project')} →](${SITE}?kind=project&sort=-stars)

${projects}

## Subagents and roles

**Claude Code subagent collections**

${collections.join('\n')}

**Paperclip companies with the most-starred source projects** ([all companies](https://t-ai-labs.github.io/awesome-paperclip-companies/))

${companies.join('\n')}

## How it works

A weekly GitHub Action collects everything again and publishes the site.

- **Roles** come from the companies listed by [Awesome Paperclip Companies](https://t-ai-labs.github.io/awesome-paperclip-companies/), which import-tests each one.
- **Subagents** come from openly licensed Claude Code collections in [\`data/collections.json\`](data/collections.json).
- **Runtimes** and **frameworks** are picked by hand in [\`data/runtimes.json\`](data/runtimes.json) and [\`data/frameworks.json\`](data/frameworks.json).
- **Adapters** are found by searching npm for Paperclip adapters. Shared helper libraries and verbatim forks are left out.
- **Projects** are the top 100 results of the GitHub searches in [\`data/rankings.json\`](data/rankings.json).
- **Growth** is measured from star snapshots kept in [\`data/history.json\`](data/history.json), because GitHub no longer shares when a star was given. **Activity** counts weekly commits on the default branch; **downloads** come from npm and PyPI.

"Runs in" is exact for roles, subagents, runtimes and adapters. For projects it is read from their description and topics.

## Suggest an agent

[Open an issue](${REPO}/issues/new?template=suggest-agent.yml) with the repository, or a pull request that adds it to one of the files in \`data/\`.

## License

The code of this list is under the [MIT license](LICENSE). Names and descriptions belong to their authors and stay under their licenses; each entry links its source.

<sub>Updated ${date}.</sub>
`

writeFileSync('README.md', readme)
console.log('README.md written')
