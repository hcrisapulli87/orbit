import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const svg = readFileSync(fileURLToPath(new URL('../public/favicon.svg', import.meta.url)))

for (const [name, size] of [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const out = fileURLToPath(new URL(`../public/${name}`, import.meta.url))
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(out)
  console.log('wrote', name)
}
