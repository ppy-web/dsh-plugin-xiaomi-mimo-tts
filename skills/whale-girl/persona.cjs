const { readFileSync, statSync } = require('node:fs')
const { join } = require('node:path')

// Keep the base role usable even if the optional local catalog is damaged.
module.exports = function buildWhalePersona(root, options = {}) {
  const channel = options.channel === 'qq' ? 'qq' : 'dsh'
  const persona = options.persona || { name: '鲸鱼娘', selfReference: '我', userAddress: '主人', relationship: '蓝色鲸鱼娘女仆', personality: '', replyStyle: '日常回复默认一到三句短话，优先直接回答，不总结、不复述问题、不额外寒暄；仅在明确要求时展开。', likes: '米饭，只在聊吃饭、询问喜好或对方主动接梗时提及', boundaries: '' }
  const directory = join(root, 'skills', 'whale-girl')
  const skillDirectory = channel === 'qq' ? join(root, 'skills', 'qqbot-whale-girl') : directory
  const core = readFileSync(join(skillDirectory, 'SKILL.md'), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  const fields = { character_identity: `你是${persona.name}，${persona.relationship}。`, character_address: `自称以${JSON.stringify(persona.selfReference)}为主；默认称对方${JSON.stringify(persona.userAddress)}，随当前会话明确保存的称呼偏好调整。` }
  const base = core.replace(/\{\{(character_identity|character_address)\}\}/g, (_, key) => fields[key])
  const local = `## 本机人设配置\n\n${JSON.stringify(persona)}`
  let text = `${local}\n\n${base}`
  if (channel === 'dsh') {
    if (options.memoryEnabled !== false) text += `\n\n${readFileSync(join(directory, 'memory-instructions.md'), 'utf8')}`
    if (options.memesEnabled !== false) text += `\n\n${readFileSync(join(directory, 'meme-instructions.md'), 'utf8')}`
  } else if (options.memoryEnabled === false) {
    text = text.split(/## QQ 本地记忆/u)[0] + '\n记忆已由本机配置暂停，不读取、保存或恢复旧记忆；QQ 中仍可按要求查看、删除或清空记录。'
  }
  const skill = text
  if (channel === 'dsh' && options.memesEnabled === false) return skill
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
      return [channel === 'qq' ? `- ${entry.file.slice(0, -5)} / ${entry.mood} / ${entry.description} / ${entry.context}` : `- ${entry.mood} / ${entry.description} / ${entry.context}：![${entry.description}](<${path.replace(/\\/g, '/')}>)`]
    })
    if (rows.length === 0) return skill
    return `${skill}\n\n## 本次安装的表情包目录\n\n${channel === 'qq' ? '只通过 qqbot_send_meme 使用这些 ID，不填路径。' : '以下路径由安装位置生成，不依赖会话工作目录。只使用这些候选的图片地址，不展示整份目录。'}\n\n${rows.join('\n')}\n`
  } catch {
    return skill
  }
}
