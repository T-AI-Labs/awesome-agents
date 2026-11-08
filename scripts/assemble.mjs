import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [agentsPath = 'results/agents.json', out = 'public'] = process.argv.slice(2)
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const { generatedAt, repos, agents } = readJson(agentsPath)

// The site derives these commands from the file link, which keeps the download small.
const DERIVED_INSTALL = new Set(['role', 'subagent'])

const slim = agent => {
  const { install, packages, ...rest } = agent
  const kept = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)))

  if (!DERIVED_INSTALL.has(agent.kind) && install?.length) kept.install = install
  if (packages?.npm || packages?.pypi) kept.packages = Object.fromEntries(Object.entries(packages).filter(([, value]) => value))

  return kept
}

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'data'), { recursive: true })
cpSync('site', out, { recursive: true })

writeFileSync(join(out, 'data', 'agents.json'), JSON.stringify({
  generatedAt,
  kinds: readJson('data/kinds.json'),
  categories: readJson('data/categories.json'),
  rankings: readJson('data/rankings.json').map(({ id, label }) => ({ id, label })),
  repos,
  agents: agents.map(slim),
}))

console.log(`Site with ${agents.length} agents assembled in ${out}`)
