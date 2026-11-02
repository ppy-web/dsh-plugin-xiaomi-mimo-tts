export type BreezeAudioTagLanguage = 'zh' | 'en'

export interface BreezeAudioTagGroup {
  label: string
  tags: readonly string[]
}

export const BREEZE_AUDIO_TAG_GROUPS: Record<BreezeAudioTagLanguage, readonly BreezeAudioTagGroup[]> = {
  zh: [
    { label: '笑声', tags: ['[笑]', '[轻笑]', '[咯咯笑]'] },
    { label: '哭声与疼痛', tags: ['[哭声]', '[抽泣]', '[呜咽]', '[呻吟]', '[哀号]'] },
    { label: '呼吸', tags: ['[叹气]', '[惊呼]', '[吸气]', '[呼气]', '[喘息]'] },
    { label: '发声方式', tags: ['[耳语]', '[喊叫]', '[惨叫]', '[唱歌]', '[哼歌]', '[结巴]', '[停顿]'] },
    { label: '喉咙与鼻音', tags: ['[清嗓]', '[咳嗽]', '[吸鼻子]', '[咂嘴]', '[啧嘴]'] },
    { label: '身体反应', tags: ['[打哈欠]', '[打喷嚏]', '[打嗝]', '[打饱嗝]', '[吞咽]', '[干呕]'] },
    { label: '情绪反应', tags: ['[闷哼]', '[冷笑]', '[哼鼻子]'] },
  ],
  en: [
    { label: 'Laughter', tags: ['(laughs)', '(chuckles)', '(giggles)'] },
    { label: 'Crying & pain', tags: ['(cries)', '(sobs)', '(whimpers)', '(groans)', '(moans)'] },
    { label: 'Breathing', tags: ['(sighs)', '(gasps)', '(inhales)', '(exhales)', '(breathes heavily)'] },
    { label: 'Vocal delivery', tags: ['(whispers)', '(shouts)', '(screams)', '(sings)', '(hums)', '(stutters)', '(pauses)'] },
    { label: 'Throat & nose', tags: ['(clears throat)', '(coughs)', '(sniffles)', '(lip smacks)', '(clicks tongue)'] },
    { label: 'Body reflexes', tags: ['(yawns)', '(sneezes)', '(hiccups)', '(burps)', '(gulps)', '(gags)'] },
    { label: 'Emotional reactions', tags: ['(grunts)', '(scoffs)', '(snorts)'] },
  ],
}
