/** Recommended MiMo v2.5 tags; the model also accepts custom sound descriptions. */
export const XIAOMI_AUDIO_TAG_GROUPS = [
  { zh: '基础情绪', en: 'Emotions', english: ['happy', 'sad', 'angry', 'afraid', 'surprised', 'excited', 'aggrieved', 'calm', 'indifferent'], tags: ['开心', '悲伤', '愤怒', '恐惧', '惊讶', '兴奋', '委屈', '平静', '冷漠'] },
  { zh: '复合情绪', en: 'Mixed emotions', english: ['wistful', 'relieved', 'helpless', 'guilty', 'at peace', 'jealous', 'weary', 'uneasy', 'moved'], tags: ['怅然', '欣慰', '无奈', '愧疚', '释然', '嫉妒', '厌倦', '忐忑', '动情'] },
  { zh: '整体语调', en: 'Delivery', english: ['gentle', 'aloof', 'lively', 'serious', 'lazy', 'playful', 'deep', 'brisk', 'sharp'], tags: ['温柔', '高冷', '活泼', '严肃', '慵懒', '俏皮', '深沉', '干练', '凌厉'] },
  { zh: '音色定位', en: 'Voice texture', english: ['magnetic voice', 'rich voice', 'clear voice', 'ethereal voice', 'young voice', 'aged voice', 'sweet voice', 'hoarse voice', 'mellow voice'], tags: ['磁性', '醇厚', '清亮', '空灵', '稚嫩', '苍老', '甜美', '沙哑', '醇雅'] },
  { zh: '人设腔调', en: 'Character voice', english: ['cutesy voice', 'mature female voice', 'young boy voice', 'middle-aged male voice', 'Taiwanese accent'], tags: ['夹子音', '御姐音', '正太音', '大叔音', '台湾腔'] },
  { zh: '方言与角色', en: 'Dialects & characters', english: ['Northeastern Chinese dialect', 'Sichuan dialect', 'Henan dialect', 'Cantonese', 'Sun Wukong', 'Lin Daiyu'], tags: ['东北话', '四川话', '河南话', '粤语', '孙悟空', '林黛玉'] },
  { zh: '唱歌（插入句首）', en: 'Singing (insert at start)', english: ['sing', 'singing'], tags: ['唱歌', 'sing', 'singing'], placement: 'start' },
  { zh: '呼吸与节奏', en: 'Breathing & rhythm', english: ['inhale', 'deep breath', 'sigh', 'long sigh', 'heavy breathing', 'hold breath'], tags: ['吸气', '深呼吸', '叹气', '长叹一口气', '喘息', '屏息'] },
  { zh: '情绪状态', en: 'Emotional state', english: ['nervous', 'scared', 'excited', 'exhausted', 'aggrieved', 'coy', 'guilty', 'shocked', 'impatient'], tags: ['紧张', '害怕', '激动', '疲惫', '委屈', '撒娇', '心虚', '震惊', '不耐烦'] },
  { zh: '语音特征', en: 'Vocal expression', english: ['trembling', 'shaky voice', 'pitch shift', 'voice break', 'nasal voice', 'breathy voice', 'hoarse voice'], tags: ['颤抖', '声音颤抖', '变调', '破音', '鼻音', '气声', '沙哑'] },
  { zh: '哭笑表达', en: 'Laughter & crying', english: ['laugh', 'chuckle', 'laugh loudly', 'scoff', 'sob', 'whimper', 'choked up', 'cry loudly'], tags: ['笑', '轻笑', '大笑', '冷笑', '抽泣', '呜咽', '哽咽', '嚎啕大哭'] },
] as const

export const XIAOMI_AUDIO_TAG_GUIDANCE = ' Xiaomi MiMo audio tags (only for Xiaomi mimo-v2.5-tts, only in this tool\'s text argument, never in normal chat replies): '
  + XIAOMI_AUDIO_TAG_GROUPS.map(group => `${group.zh}: ${group.tags.join('/')}`).join('; ')
  + '. Put overall style at the beginning, e.g. (温柔 俏皮)你好; put local sound cues inline, e.g. 你好[轻笑]今天怎么样？ Chinese accepts (), （） or []; English accepts () or []. Custom sound descriptions and combined styles are supported, e.g. （紧张，深呼吸） or (soft, tired). Describe only audible delivery, emotion or sounds, never body actions. Use a few cues, do not pile them up. Singing requires (唱歌), (sing) or (singing) at the very beginning. VoiceDesign does not support audio tags: use speechInstruction instead. When retrying with another provider, remove these tags and use that provider\'s own syntax.'

/** Match whole controls, including free-form and combined descriptions. */
export const XIAOMI_AUDIO_TAG_PATTERN = /\([^()\r\n]+\)|（[^（）\r\n]+）|\[[^\]\r\n]+\]/gu

/** Browser speech must never pronounce inline sound descriptions. */
export function stripXiaomiAudioTags(value: string): string {
  return value.replace(XIAOMI_AUDIO_TAG_PATTERN, ' ')
}
