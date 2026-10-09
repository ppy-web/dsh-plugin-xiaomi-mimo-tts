const { readFileSync, statSync } = require('node:fs')
const { join } = require('node:path')

// Keep the role and CDN fallback usable even if the optional local catalog is damaged.
module.exports = function buildWhalePersona(root) {
  const directory = join(root, 'skills', 'whale-girl')
  const skill = readFileSync(join(directory, 'SKILL.md'), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  try {
    const catalog = JSON.parse(readFileSync(join(directory, 'memes.json'), 'utf8'))
    if (!Array.isArray(catalog.memes)) return skill
    const seen = new Set()
    const rows = catalog.memes.flatMap((entry) => {
      if (!entry || entry.automatic !== true || typeof entry.mood !== 'string'
        || typeof entry.description !== 'string' || typeof entry.context !== 'string'
        || typeof entry.file !== 'string' || !/^[a-z]+(?:-[a-z]+)+\.webp$/.test(entry.file)
        || !entry.file.endsWith(`-${entry.mood}.webp`) || seen.has(entry.file)) return []
      const path = join(directory, 'meme', entry.file)
      try {
        if (!statSync(path).isFile()) return []
      } catch {
        return []
      }
      seen.add(entry.file)
      return [`- ${entry.mood} / ${entry.description} / ${entry.context}：![${entry.description}](<${path.replace(/\\/g, '/')}>)`]
    })
    if (rows.length === 0) return skill
    return `${skill}\n\n## 本次安装的本地表情包目录\n\n以下路径由安装位置生成，不依赖会话工作目录。只从这些候选选择自动表情，原样使用图片地址，不展示整份目录。\n\n${rows.join('\n')}\n`
  } catch {
    return skill
  }
}
