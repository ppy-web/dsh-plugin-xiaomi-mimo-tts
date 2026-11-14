const { readFileSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')

function loadWhaleMemes(directory) {
  try {
    const catalog = JSON.parse(readFileSync(join(directory, 'memes.json'), 'utf8'))
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return []
    return Object.entries(catalog).flatMap(([id, label]) => {
      if (!/^[1-9]\d*$/u.test(id) || typeof label !== 'string' || !label.trim() || /[\r\n]/u.test(label)) return []
      const path = join(directory, 'meme', `${id}.webp`)
      try {
        return statSync(path).isFile() ? [{ id, label, path }] : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

module.exports = function buildWhalePersona(root, options = {}) {
  const channel = options.channel === 'qq' ? 'qq' : 'dsh'
  const persona = options.persona || { name: '鲸鱼娘', selfReference: '我', userAddress: '主人', relationship: '蓝色鲸鱼娘女仆', personality: '', replyStyle: '日常回复默认一到三句短话，优先直接回答，不总结、不复述问题、不额外寒暄；仅在明确要求时展开。', likes: '米饭，只在聊吃饭、询问喜好或对方主动接梗时提及', boundaries: '' }
  const directory = resolve(root, 'skills', 'whale-girl')
  const skillDirectory = channel === 'qq' ? join(root, 'skills', 'qqbot-whale-girl') : directory
  const core = readFileSync(join(skillDirectory, 'SKILL.md'), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  const fields = { character_identity: `你是${persona.name}，${persona.relationship}。`, character_address: `自称以${JSON.stringify(persona.selfReference)}为主；默认称对方${JSON.stringify(persona.userAddress)}，按对方明确提出的称呼偏好调整。` }
  const base = core.replace(/\{\{(character_identity|character_address)\}\}/g, (_, key) => fields[key])
  const local = `## 本机人设配置\n\n${JSON.stringify(persona)}`
  let skill = `${local}\n\n${base}`
  if (options.memoryEnabled !== false) skill += `\n\n${readFileSync(join(skillDirectory, 'memory-instructions.md'), 'utf8')}`
  if (options.memesEnabled === false) return skill
  const memes = loadWhaleMemes(directory)
  if (memes.length === 0) return skill
  const instructions = readFileSync(join(skillDirectory, 'meme-instructions.md'), 'utf8').trimEnd()
    .replace('{{meme_directory}}', () => join(directory, 'meme').replace(/\\/g, '/'))
  const rows = memes.map(({ id, label }) => `${id} ${label}`)
  return `${skill}\n\n${instructions}\n\n${rows.join('\n')}\n`
}

module.exports.loadWhaleMemes = loadWhaleMemes
