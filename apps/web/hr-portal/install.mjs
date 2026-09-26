/**
 * Install the HR portal as the default web UI of the built dsh dist.
 *
 * dist/index.html becomes ONE document: the native app mounts into `<div
 * id="root">` and the portal overlay (right bar, sidebar/hero injections)
 * runs in that same document — no iframe, no `original.html`.
 *
 * The portal template (hr-portal/index.html) holds the shell and a
 * `<!--HRP:NATIVE-ASSETS-->` marker. This script replaces that marker with the
 * hashed entry script / modulepreload / stylesheet tags read from the freshly
 * built dist/index.html, so a rebuild always supplies the current hashes.
 *
 * Usage: node apps/web/hr-portal/install.mjs   (after `pnpm run build`)
 */
import { readFile, writeFile, rm, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const distIndex = join(distDir, 'index.html')
/** The iframe-era native snapshot; the single-document portal leaves no such file. */
const legacyNativeEntry = join(distDir, 'original.html')

/** Portal-only marker; its presence means the portal shell is already installed. */
const PORTAL_MARKER = 'HR-Starleap AI'
/** Slot in the portal template for the built asset tags. */
const ASSETS_MARKER = '<!--HRP:NATIVE-ASSETS-->'

const exists = async (p) => access(p, constants.F_OK).then(() => true, () => false)

/**
 * Collect the built entry's hashed tags from the native index head.
 *
 * Only `./assets/` tags qualify: Vite emits those, while host injections such
 * as the module-loader facade use absolute `/plugins/...` paths and must stay
 * per-request (a captured snapshot's baked-in copy would pin a stale rev).
 * @param html - the native dist index.html (raw build or rendered capture).
 * @returns the entry script / modulepreload / stylesheet tags, newline separated.
 */
function nativeAssetTags(html) {
  const head = /<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/i.exec(html)?.[1]
  if (head === undefined) throw new Error('native dist index has no <head>')
  const all = head.match(/<script\b[^>]*><\/script>|<link\b[^>]*>/gi) ?? []
  const tags = all.filter((tag) => /(?:src|href)="\.\/assets\//.test(tag))
  if (tags.length === 0) throw new Error('native dist index head carries no ./assets entry tags')
  return tags.join('\n')
}

async function main() {
  const template = await readFile(join(here, 'index.html'), 'utf8')
  if (!template.includes(ASSETS_MARKER)) throw new Error(`portal template lacks ${ASSETS_MARKER}`)
  if (!(await exists(distIndex))) throw new Error(`dist index missing: ${distIndex} (run pnpm run build first)`)

  const built = await readFile(distIndex, 'utf8')
  if (built.includes(PORTAL_MARKER)) {
    throw new Error('dist/index.html already is the HR portal; rebuild the web frontend to regenerate the native entry, then re-run install')
  }

  await writeFile(distIndex, template.replace(ASSETS_MARKER, () => nativeAssetTags(built)))
  console.log('index.html: HR portal merged into the native build (single document, no iframe)')

  if (await exists(legacyNativeEntry)) {
    await rm(legacyNativeEntry)
    console.log('original.html: removed (the portal no longer embeds an iframe)')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
