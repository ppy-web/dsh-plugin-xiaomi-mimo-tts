import { STUDIO_DEFAULT_PAUSE_MS, createBuiltinStudioRoles } from './types/studio.js'
import type { StudioRole, StudioScript } from './types/studio.js'
import { battleThroughHeavens } from './studio-presets/battle-through-heavens.js'

export const STUDIO_BUILTIN_CATALOG_VERSION = 7

type PresetLine = readonly [roleId: string, text: string, pauseAfterMs?: number, speechInstruction?: string]

interface ScriptPreset {
  id: string
  title: string
  description: string
  lines: readonly PresetLine[]
}

const nightHost = 'builtin-night-host'
const podcastHost = 'builtin-podcast-host'
const narrator = 'builtin-narrator'
const moli = 'builtin-moli'
const suda = 'builtin-suda'
const bingtang = 'builtin-bingtang'
const whale = 'builtin-whale'
const chloe = 'builtin-chloe'
const dean = 'builtin-dean'
const sharedVoiceDesignRoles = new Set([nightHost, narrator, 'builtin-suspense', whale])

const nightRadio: ScriptPreset = {
  id: 'builtin-script-night-radio',
  title: '深夜女声电台主播',
  description: '《留一盏灯》。沈听澜独白，读一封关于旧路灯和夜归人的来信。',
  lines: [
    [nightHost, '这里是《留一盏灯》，我是沈听澜。现在是十二点过一点。刚进门的人，可以先把钥匙搁下。还在路上的人，慢慢走，走到有光的地方再看手机。', 900],
    [nightHost, '今天没有开场曲。我想让你听一小会儿节目开始以前的声音。录音室的风扇还在转，窗外刚过去一辆车。路上偶尔有人，夜里也就有了形状。', 1100],
    [nightHost, '今晚的来信来自阿沐。标题只有四个字，灯还亮着。我点开的时候，以为他会讲一个等他回家的人。读完才发现，他写的是一盏路灯。', 700],
    [nightHost, '阿沐说，他下夜班总要从老菜市场后面走。那里有一截窄路，白天堆着空筐和三轮车。凌晨，只有一盏橘色的灯亮着，灯下能看见墙脚一小簇长出来的草。', 750],
    [nightHost, '有一年冬天，灯坏了。第一天他打开手机照路。第二天，他记住了哪块地砖翘着角。到了第三天，路口多了一张纸，字写得很大。天黑，慢点走。', 1100, '读纸条时稍慢，像隔着一段路认字'],
    [nightHost, '纸是对面修鞋摊的师傅贴的。摊子傍晚就收，师傅自己从来不走夜路。阿沐第二天特地提前出门，问他怎么知道灯坏了。师傅说，最近收摊晚，天天有人开着手机从这儿过去。', 550],
    [nightHost, '两个人就站在门口聊了几句。阿沐才知道，师傅每天把没用完的鞋带绕好，挂在门边，遇到要换的人可以自己拿。他原先以为那是摊子上摆着卖的。', 650],
    [nightHost, '后来街道把灯修好了，师傅把纸揭下来，又把纸翻过来写了一行。灯好了，地砖还翘着。阿沐读到这句，笑了。信里提到整条街的人，我最先记住的就是这个师傅。', 900, '最后两句带一点笑意'],
    [nightHost, '他在信末写道，那阵子生活里有几件大事，一直没有结果。路灯修好的那天，他仍然没等到想要的消息，只是过拐角时发现，自己可以从口袋里腾出一只手了。', 1150],
    [nightHost, '有些改变就是这么小。另一只手终于可以扶住袋子，用来打个招呼，或者空着。等你真正需要它的时候，也许才会发觉，前面已经有一点路被照亮了。', 1250],
    [nightHost, '说到这儿，我想起父亲送我去外地的那天。他一直在站台上问，还有没有东西忘带。我说没有。他点点头，又站了一会儿。那时我急着上车，后来才懂得，他是想把话多说一会儿。', 900],
    [nightHost, '我现在偶尔给他打电话，也会听见他把电视调小，然后问我，家里的灯泡是不是够亮。电话里很难说清楚亮不亮。于是我每次都说，我这会儿看得见你。', 1150],
    [nightHost, '如果你今天收到过这样一句看似寻常的话，可以记一记它。有人问你车停哪儿了，提醒你门口的积水。那些话写进一封信里，也许就能让另一个人看见那条路。', 1000],
    [nightHost, '阿沐，今晚这封信我读完了。你说修鞋摊月底就要搬走。下次碰见那位师傅，替我们向他问个好。也告诉他，我们记得那行写在纸背面的字。', 850],
    [nightHost, '节目快结束了。要洗的杯子，明早洗也来得及。还在等消息的话，可以先从窗边走开，给自己留十分钟。录音室的灯我待会儿再关。', 950],
    [nightHost, '这里是《留一盏灯》。我是沈听澜。祝还在路上的人平安到家。晚安。', 1500, '收尾放轻，晚安前留出短暂停顿'],
  ],
}

const productVideo: ScriptPreset = {
  id: 'builtin-script-product-video',
  title: '视频配音剧本',
  description: '《给手机留个位》。茉莉演示折叠桌面手机支架，许闻川上手体验和提问，适合产品介绍类短视频。',
  lines: [
    [podcastHost, '我就回条消息，手机怎么又从杯子上滑下来了？', 250, '像刚伸手接住滑下来的手机，语气有点意外'],
    [moli, '杯子还得喝水呢。试试这个，折叠桌面手机支架。', 220, '带点笑意，清楚地说出产品名'],
    [podcastHost, '这薄薄一片，怎么用？', 180],
    [moli, '打开底座，把这块托板抬起来。手机往上一放，就立在桌面上了。', 300, '跟着手上的动作说，放手机前顿一下'],
    [podcastHost, '我坐低一点，能把屏幕朝我这边调吗？', 180],
    [moli, '可以。推一下托板，调到你看得顺眼的角度。开视频会的时候就不用一直举着手机了。', 230],
    [podcastHost, '那我待会儿一边吃饭一边看剧，能横着放吗？', 180],
    [moli, '能，直接横过来就行。底座还在原来那个位置。', 240],
    [podcastHost, '等会儿，我手机要没电了。立着还能接线吗？', 180],
    [moli, '看托槽中间这个缺口。充电线从这儿穿过去，插头就能接到手机底下。', 270],
    [podcastHost, '我这个手机壳挺厚，怎么知道放不放得下？', 210],
    [moli, '量一下带壳的厚度，再对照商品页写的适配尺寸。', 220],
    [podcastHost, '用完往回一合，刚好能塞进包里的小口袋。', 240, '像收好支架以后随口说一句'],
    [moli, '如果你桌上也缺个放手机的位置，点开商品卡，看看尺寸和款式，合适就带一个走。', 450, '自然收尾，说清楚商品卡'],
  ],
}

const suspenseDrama: ScriptPreset = {
  id: 'builtin-script-suspense',
  title: '多角色长篇悬疑剧',
  description: '《七码头的第二声》。六幕六角色，录音修复员在拆除旧信号站前，追查一份十七年前的失踪报告。',
  lines: [
    // 第一幕 · 试灯
    [narrator, '第一幕，试灯。石汀港的外海堤入夜以后就不见人了。两盏新信号灯照着进港水道，离它们一百多米远，是废了十七年的七码头信号站。明早八点，拆除围挡就会封住这条路。', 650],
    [narrator, '夜里十一点十七分，一辆车停在围挡旁。录音修复员茉莉提着清点箱赶来。她接到港务档案组的通知，旧站刚为了清点设备恢复供电，有一段声音一直从退役的广播里传出来。'],
    [moli, '闻川，你确认这个开关以前是关着的吗？我进门的时候听见一声，它说北灯回一声。说完又停了。', 720, '音量压低，提问简短直接'],
    [podcastHost, '供电是今晚恢复的。广播一响我就给档案组打了电话。里面那台机器旧得很，碰上停电会自己重放。我在外边等你，里面的东西没动。'],
    [suda, '小声点，下一轮要来了。上一轮我录到两次短声，间隔一样。听起来像设备的测试片头。'],
    [nightHost, '石汀港夜间值班通报。北灯，回一声。', 1500, '像有点走音的旧调度录音，末尾等待回复'],
    [bingtang, '是沈听澜的声音。我妈每晚值班的时候，有时会把这个频道开在厨房里。后来家里就再也没开过。', 650],
    [moli, '冰糖，你把你说的那份报告带来了吗？'],
    [bingtang, '在这里。十七年前九月十七日。零点四十七分，值班员陈岚擅自引导青芦号疏散艇进入南汊。船触礁失踪，原因待查。陈岚是我妈。报告下面的待查一直没有后文。', 850],
    [podcastHost, '那一晚风大得听不清两米外的人。我第二天去北灯台帮忙清理，天亮前，没人知道青芦号在哪儿。'],
    [moli, '这份报告说北灯台停用，根本没参与疏散。你早上为什么到那里去？', 570],
    [podcastHost, '我记得是收设备。时间太久了。到底要清点哪些，今天写给我的单子在门上，你们先弄。', 700, '不耐烦藏得住，答得偏快'],
    [suda, '茉莉，过来看这个。广播机只接了一边声道，录音带盒上却写了两路。贴纸是手写的，第一遍听广播，第二遍听回声。', 900],
    [narrator, '茉莉看了一眼北边。那座灯台就剩一个黑影，孤零零立在海堤背面。风把站里的门吹紧，门上的清单响了一声。最末一项是待报废磁带三盒，验收后现场销毁。', 1500],

    // 第二幕 · 比公报早十五分钟
    [narrator, '第二幕，比公报早十五分钟。苏打关掉向屋外试放的广播，把录音送进两只监听耳机。左边是十七年前的石汀港，右边只听得见雨。', 680],
    [suda, '两路真有东西。右边非常轻，底噪下面有一句人声。我把前后一起放，别急着暂停。'],
    [nightHost, '零点三十二分，第二次潮情通报。南汊的浮标熄了，原定疏散航线仍是北汊。北灯，回一声。', 850, '公务播报，靠近话筒，清楚读出时间和航线'],
    [moli, '她自己报了时间。公报里的第一条命令是零点四十七分。这一段早十五分钟，而且她说原定航线是北汊。', 620],
    [suda, '我在右边听到一声回执，再往后有个男的说，先把报时关掉。这一句不在原来对外播的那路上。'],
    [bingtang, '为什么关报时？我妈没有自己的表。她说时间都照着电台抄。'],
    [podcastHost, '风里通报改来改去，收不全也常见。能听出几点，未必就能知道那条船往哪边走。', 650],
    [moli, '你说得对，所以我们找独立的东西对时间。冰糖，清点箱里有昨天从客运处移交的票根。九月十七日，你知道票根上的编号怎么对吗？'],
    [bingtang, '这儿，从五十六到七十四，十九张。票根复写联收进客运处，登船联才跟船。我妈以前管这批票，她教过我看上联的打孔位置。', 630],
    [suda, '有个蓝章。北灯临时接收。十七日，零点四十一分。这是盖在登船之前，还是之后？'],
    [bingtang, '接收章是下船之后打的。我从来没见过北灯台的章。我只知道那份报告说，搜救直到一点以后才开始。', 780],
    [moli, '要么有人把章提前盖了，要么十九个人在船被报失踪以前就到了北灯。我们还差一份收人的名单，或者听见当天的人说话。'],
    [narrator, '票根在台灯下摊开，十九个编号连在一起，没有缺口。茉莉把票根留在原位拍了照。照片发出以后，档案组值守回复说，明早的拆除会等她把清点意见提交。', 1250],

    // 第三幕 · 门后那一页
    [narrator, '第三幕，门后那一页。北灯台与七码头隔着一截防浪堤。雨水还没干，灯台门内的地上能看见几道拖擦过的白痕。闻川拿着手电走在最前面。', 700],
    [bingtang, '你知道钥匙在哪儿，也知道这里的灯突然开过。你是头一次回来吗？'],
    [podcastHost, '去年也来了一回。管理处说改造前要找旧图纸，叫了我。我在门口站了一会儿，那回没进里面。', 720],
    [suda, '木头下面有一张纸。先别拔，是压在门后的疏散示意图底下。冰糖，你从我这边照一下，我记住原来的位置。'],
    [moli, '抬一点。字透过来，是值班簿的一页，边上还有蓝墨渗进去的痕迹。其他页都不在，怎么单单把这一张压在图后面？'],
    [bingtang, '上面写青芦号。北侧泊位到达，十九人，轻伤一人。接收人，沈听澜。签发人是陈岚。她写名字的最后一笔，总留一小截回钩。', 900, '念到名字时慢下来，认出笔迹后短暂停顿'],
    [podcastHost, '把手电举高一点。签名下面应该还有一行。她以前填这种单，会把应该移交的东西顺手写在最底下。'],
    [suda, '有。两只话筒都开了，收站二箱。下边又写，带盒三，沈。收站二箱是什么？'],
    [moli, '七码头那台录音机上有两个输入，广播一路，站内话筒一路。盒上也写二和三。这张纸记录的是她把备用录音交给谁。'],
    [podcastHost, '簿子可以证实人到了北灯。事故厅那边也许会说，一张从旧门后面翻出来的纸，登记日期和签名都可以事后写。'],
    [bingtang, '也许会。按你这个说法，我们手里已经有两种互不相干的记录，如果还找得到三号带，就能听见签名的人。'],
    [narrator, '冰糖把纸托上文件夹时，门底忽然簌簌地响。是一片干了的旧蓝油纸，从夹缝掉出来。油纸上留下的是几段复写不全的字，最清楚的刚好是日期和十九个人。', 600],
    [moli, '这一片也一起带走，记录是在门后同一个位置发现的。回去找带盒。闻川，我要问一句，纸上的底行你怎么知道得这么清楚？', 750],
    [podcastHost, '因为我看着陈岚写的。那天零点四十一分，我就在这里。', 1700, '声音放低，承认时沉稳地落下'],

    // 第四幕 · 回声那一轨
    [narrator, '第四幕，回声那一轨。回到七码头信号站的时候，午夜已经过了。窗外的旧吊车在风里轻轻晃。闻川终于把自己当夜的时间说了一遍。', 650],
    [podcastHost, '零点三十二分，邵平洲让我改广播，说北汊要腾给一艘运料驳船，让疏散艇往南。北汊那晚挤一挤也许能过两条船，他的合同有进港时限，一直在催。'],
    [moli, '南汊的灯呢？听澜通报里说有浮标熄了。'],
    [podcastHost, '已经有两盏熄了。陈岚听完没照他的口令走。她把人送到了北灯台，青芦号靠岸时撞裂了舷边，只能留在潮水下过夜。后来停泊缆松了，天亮的时候船漂出了湾口。', 720],
    [bingtang, '所以船到港是事实，船后来找不到也是事实。公报从中间挑了一个零点四十七分，把前后所有人和北灯都抹掉了。', 780],
    [podcastHost, '那张报告是我替邵平洲誊的。我没有写上北灯，签完字之后把原本收进档案的簿子抽了一页。在封柜之前，陈岚拿走了她的记录，交给了听澜。', 980],
    [suda, '那听澜手里那盒带子，现在也在这个站里吗？前两盒我都打开看过，内容都是白天的试灯。'],
    [podcastHost, '我给她打电话。她这些年一直在做深夜节目。她知道我今晚值守。我在外面站了四十分钟才敢拨号，她已经给我发了三个未接提醒。', 700],
    [nightHost, '闻川。你终于接了。最后一盒在旧广播机上方，倒数第二层，套了个空的培训带壳。别从那段试放后面找，从整卷开头听。', 660, '像电话里刚确认对方身份，语气压着急切'],
    [moli, '听澜，我是茉莉。你方便留一段当晚的说明吗？我们找到了接收记录，想把当时发生的事和录音对起来。'],
    [nightHost, '你可以留。人是陈岚送到的。我在灯台给他们点了人数，用那枚蓝章打了票根。回站之后她说，刚才的事有人要改，让我两只话筒都留着，那时站务话筒没人管。'],
    [suda, '找到了。卷头有说话声。这段底下还有纸页翻动的声。先把录音本身放出来，我们各自听，别猜下一句。', 750],
    [nightHost, '试音记录，零点三十二分。北灯，回一声。', 1050, '保持当年值班播报音色，给接收方一次空档'],
    [podcastHost, '收到，十九位旅客即刻备航。邵主管要北汊先放料船。请撤下这段报时。', 1100, '当年应答的干脆语气，最后一句说得略急'],
    [nightHost, '零点四十一分。北灯已接收十九人，一位轻伤。陈岚要求将通报与接收单归入同一班次。现场记录仍继续。', 1150, '一边点名字一边读回执，紧张但吐字清楚'],
    [narrator, '两段之间有九分钟的雨声。苏打没有跳过去，一分一分留了副本。最后几秒里，有人匆忙跑向话筒旁，手来不及按停止，留下一声甩动的门响。', 1450],

    // 第五幕 · 谁的名字
    [narrator, '第五幕，谁的名字。对讲机里有人提醒，拆除队提前到港，正在门外等签收。清点单压在桌角，三盒带子的去向仍空着。', 650],
    [bingtang, '就这么交出去，他们会不会又把原本弄丢？当年那一页只剩在门后这张，第二份报告还有人转寄过。我怕同样的事再发生一次。'],
    [moli, '我们用这两份材料提交档案更正申请，让值守先把原件入库，三个人一起点交。照片、编号和原音副本分开留，清单上把它们一件一件写进去。', 680],
    [suda, '我给三条录音加了来源和对应时间，原始文件都留着。试听片里我截了两段，正式提交还是带上完整那一卷，九分钟也一起交。'],
    [podcastHost, '可以把我那边的声和人名写进去。我先承认报告是谁誊的，档案组总要找这个人核对。'],
    [bingtang, '你准备署名给他们，还是准备回去想一个不那么难看的说法？我想知道，十七年前你为什么帮那个把我妈名字写进去的人。', 800, '语速稍快，忍着情绪直接追问'],
    [podcastHost, '当时办公室只有我一个临时工，邵平洲说，签了之后给我转正。我接受了。前几年我见过你母亲，我绕到超市另一边，等她先结账。现在对你说这句，比在门口等你们难得多。', 1150],
    [bingtang, '那就把这两句话也写上。我妈在公报和档案里已经被含糊地说过太多年了。', 800, '把情绪收住，每个字落稳'],
    [nightHost, '还有我。我保存带子，是以为到换届的时候就有人肯翻。后来每个月都觉得先等下个月。我们把能证实的事情说全，其余的交给之后的调查。', 800],
    [suda, '拆除的人到了，站在门外。我可以把清点单拿过去讲清楚。你们录声明，录完帮我读一遍设备编号，我核对三盒。'],
    [moli, '好。我现在通知值守。发现三盒有历史录音的原带、一页接收记录和复写底片。请先封存信号站，停下拆除，转档案组核验。', 700],
    [narrator, '电话那端静了十几秒，接着开始询问登记编号。冰糖把十九张票根重新数了一遍，报给了茉莉。门外的工人关掉手电，往停车的地方退了一步。', 1500],

    // 第六幕 · 有人回一声
    [narrator, '第六幕，有人回一声。凌晨四点二十分，一辆车从档案馆开来。三盒磁带和纸张在现场签收，七码头改成临时保全。旧信号站外的白灯亮了通宵，直到潮水退下去。', 700],
    [bingtang, '妈，我在旧站。我们找到那天盖章的票了，能对上你写的人数。我现在就把照片发给你。你先别起来，明早看也可以。', 880, '像对电话留言说话，末尾让语气慢慢松下来'],
    [suda, '你一晚上没喝水。车里有半瓶新的。到门口看一眼吧，北灯台露出两级台阶了。你妈那天应该就是从那里把人扶上去的。'],
    [bingtang, '那我往边上站一点。要是照片拍得到台阶，待会儿就再补一张给她。她没告诉过我，原来能离北灯台这么近。', 700],
    [podcastHost, '我手写的说明刚签完，顺便把那份誊写之前的口令也录下来了。档案值守说会调取驳船的原始靠泊记录，核验之前先把公报附上一条更正申请。'],
    [moli, '好。令单、回执、票根和你的说明都各有编号。有人来问，现场到底知道了什么，我们就按这个顺序说。至于当年是谁批准改航，核验结果出来以后，会有依据。', 680],
    [nightHost, '我明晚在节目里可以念一封信吗？陈岚有次说，救人的人都记得自己当时有多狼狈，能把经过讲一遍给人听，就算有人帮你记住那个夜晚。', 850],
    [bingtang, '先问过我妈吧。她高兴了也许会自己讲。她说话快，你得让她两三句之间停一下。', 750, '轻松一些，笑意第一次松开'],
    [narrator, '苏打收好耳机。那卷凌晨的原音仍在副本里转，茉莉把最后一个试听点停在公报那行时间之前。办法再简单不过，每叫一次北灯，空出一点时间，等对方回答。', 850],
    [nightHost, '北灯，回一声。', 1150, '近麦，像等很远的地方传来回答'],
    [bingtang, '北灯收到。十九人，全部到岸。', 1600, '清楚平稳，像终于把一句迟到的回执念了出来'],
    [narrator, '海堤外，第一艘早班船驶进了湾口。档案更正还有许多手续。从这个早晨起，零点四十一分有了一份可以查到的接收记录，签发人一栏端端正正写着陈岚。', 850],
    [narrator, '你刚才收听的是《七码头的第二声》。全剧终。', 1500],
  ],
}

const dailyComedy: ScriptPreset = {
  id: 'builtin-script-daily-comedy',
  title: '轻喜剧日常小剧场',
  description: '《深夜泡面保卫战》。鲸鱼娘、苏打与冰糖的三人合租日常，节奏轻快、互怼自然，适合展示多角色对话张力。',
  lines: [
    [whale, '等等，厨房灯怎么还亮着？不是说好了晚上十一点以后全屋断粮吗！', 260, '轻手轻脚凑近又突然叉腰质问，带点小傲娇'],
    [suda, '咳咳，别误会，我只是路过倒杯白开水。', 220, '强装镇定，语速略快有点心虚'],
    [whale, '白开水会飘出红烧牛肉味吗？你手里那双筷子都快冒烟了！', 240, '毫不留情拆穿，语气轻快灵动'],
    [bingtang, '抓到啦！苏打，我就说刚刚听见撕调料包的声音，你还不承认！', 220, '突然冒出来抓现行，清甜活泼带笑意'],
    [suda, '喂，你俩怎么跟装了雷达似的？我刚烧好水还没掀盖子呢。', 260],
    [whale, '哼，本女仆的嗅觉可是全屋最高优先级。说吧，藏在最里面那桶限定番茄味是不是也被你盯上了？', 300, '微微得意，带一点傲娇小气场'],
    [suda, '那桶我哪敢动啊，上面贴着你画的三张警告便签呢。我就泡了最普通的那款。', 240],
    [bingtang, '好香啊……苏打，水还剩多少？我觉得我现在也有点需要补充夜间能量。', 260, '话锋一转瞬间叛变，语气俏皮期待'],
    [whale, '喂！冰糖，刚才到底是谁信誓旦旦说今晚一起监督减肥的？', 220, '不可置信地吐槽，尾音微微上扬'],
    [bingtang, '监督的是不要一个人偷吃嘛，三个人分就不算偷吃啦！', 240, '理直气壮地歪理，轻快可爱'],
    [suda, '有道理！而且我顺手还卧了个溏心蛋，再晚半分钟蛋白就要老了。', 280, '顺水推舟热情安利'],
    [whale, '……啧，真是拿你们没办法。既然都煮好了，浪费粮食反而更不划算。', 320, '嘴硬心软，略微停顿后傲娇妥协'],
    [bingtang, '耶！我去拿三个小碗，顺便把冰箱里的气泡水也端出来！', 220],
    [suda, '鲸鱼娘，那刚才说的十一点断粮规矩还算数吗？', 240, '憋着笑明知故问'],
    [whale, '今天属于临时加餐特例！吃完赶紧把碗洗了，明天我可不会再心软了哦。', 320, '佯装严肃强调，末尾藏着一点笑意'],
    [bingtang, '好好好，干杯！祝明天早起绝对不水肿！', 450, '开心收尾，清亮有活力'],
  ],
}

const listeningAnswerPauseMs = 5000

const riverSurvey: readonly PresetLine[] = [
  [chloe, 'Hi, Daniel. Are you coming to Saturday’s river survey? We’re recording where litter collects after it rains.'],
  [dean, 'I thought you needed people to pick it up. Should I bring gloves and a rubbish bag?'],
  [chloe, 'Leave those at home. This week we’ll take photos and mark the locations on a map. The council will send a clean-up team next Tuesday.'],
  [dean, 'All right. Is the old bridge still our meeting point?'],
  [chloe, 'The bridge is being repaired, so meet outside the visitor centre at nine. Bring a fully charged phone. We’ll work in pairs so one person can take photos while the other checks the map.', 850],
]

const museumAnnouncement: readonly PresetLine[] = [
  [chloe, 'Attention, everyone taking part in Friday’s museum visit. Please be at the school gate by eight forty-five. The coach leaves at nine. Bring a packed lunch because the museum café is closed for repairs. We’ll eat in the courtyard before returning to school.'],
  [chloe, 'You’ll get a sketchbook when you arrive, so there’s no need to bring one. You can sketch in the galleries, but please don’t take photographs there. After the visit, fill in the online feedback form by Monday. We’ll use your suggestions to plan next term’s trip.', 850],
]

const englishListeningExam: ScriptPreset = {
  id: 'builtin-script-english-listening-exam',
  title: '高三英语听力考试',
  description: 'Chloe 与 Dean 演绎的全英文听力模拟。包含校园情景短对话、河道调查长对话和参观通知，共六道选择题。短对话读一遍，长材料读两遍，每题留出作答时间。',
  lines: [
    [dean, 'Grade Twelve English listening practice. For each question, choose the best answer from A, B, and C.', 800],
    [dean, 'Part One. You will hear two short conversations. Each conversation will be played once.', 800],
    [dean, 'Question one. Listen to the following conversation.'],
    [chloe, 'The programme says the science film starts at three thirty. Shall we meet at twenty past three?'],
    [dean, 'They’ve moved it to a quarter to four. Let’s still meet at three twenty so we have time to get our tickets.', 750],
    [dean, 'What time will the science film begin? A. Three twenty. B. Three thirty. C. Three forty-five.', listeningAnswerPauseMs],
    [dean, 'Question two. Listen to the following conversation.'],
    [chloe, 'Shall I pick up the book we need for history? I can get to the library before it closes.'],
    [dean, 'Ms. Grant already lent me her copy. Could you print our notes while I finish the slides?'],
    [chloe, 'Sure. I’ll bring them to the classroom after lunch.', 750],
    [dean, 'What will the woman do next? A. Pick up a book. B. Print the notes. C. Finish the slides.', listeningAnswerPauseMs],
    [dean, 'Part Two. You will hear a longer conversation and an announcement. Each recording will be played twice.', 800],
    [dean, 'Listen to the conversation and answer questions three and four.'],
    ...riverSurvey,
    [dean, 'Now listen again.', 700],
    ...riverSurvey,
    [dean, 'Question three. What will the volunteers do on Saturday? A. Record where litter collects. B. Pick up litter. C. Help repair a bridge.', listeningAnswerPauseMs],
    [dean, 'Question four. Where will the volunteers meet? A. At the old bridge. B. At the council offices. C. At the visitor centre.', listeningAnswerPauseMs],
    [dean, 'Listen to the announcement and answer questions five and six.'],
    ...museumAnnouncement,
    [dean, 'Now listen again.', 700],
    ...museumAnnouncement,
    [dean, 'Question five. Why should students bring a packed lunch? A. The coach leaves early. B. The museum café is closed. C. They will eat on the coach.', listeningAnswerPauseMs],
    [dean, 'Question six. What should students do after the visit? A. Complete a feedback form. B. Return their sketchbooks. C. Upload their photographs.', listeningAnswerPauseMs],
    [dean, 'This is the end of the listening test.'],
  ],
}

const scriptPresets: readonly ScriptPreset[] = [nightRadio, productVideo, dailyComedy, suspenseDrama, englishListeningExam, battleThroughHeavens]

export const STUDIO_BUILTIN_SCRIPT_IDS = scriptPresets.map(preset => preset.id)

export function createBuiltinStudioScripts(now = Date.now()): StudioScript[] {
  return scriptPresets.map(({ id, title, description, lines }) => ({
    id,
    title,
    description,
    lines: lines.map(([roleId, text, pauseAfterMs = STUDIO_DEFAULT_PAUSE_MS, speechInstruction], index) => ({
      id: id + '-' + (index + 1),
      roleId,
      text,
      pauseAfterMs,
      ...(speechInstruction ? { speechInstruction } : {}),
    })),
    createdAt: now,
    updatedAt: now,
  }))
}

export function migrateBuiltinStudioPresets(
  roles: StudioRole[],
  scripts: StudioScript[],
  previousVersion: number,
  now = Date.now(),
): { roles: StudioRole[]; scripts: StudioScript[] } {
  if (previousVersion >= STUDIO_BUILTIN_CATALOG_VERSION) return { roles, scripts }
  const builtinRoles = createBuiltinStudioRoles(now)
  roles = roles.map(role => {
    if (!role.builtin || role.createdAt !== role.updatedAt) return role
    const upgradePodcast = previousVersion < 3 && role.id === podcastHost
      && role.provider === 'xiaomi' && role.model === 'mimo-v2.5-tts'
      && (role.voice === '白桦' || role.voice === 'Dean')
    const upgradeVoiceDesign = previousVersion < 6 && sharedVoiceDesignRoles.has(role.id)
    if (!upgradePodcast && !upgradeVoiceDesign) return role
    const preset = builtinRoles.find(item => item.id === role.id)
    if (!preset?.voiceDesignPrompt) return role
    const { provider, model, voice, voiceDesignPrompt } = preset
    return { ...role, provider, model, voice, voiceDesignPrompt }
  })

  const retainedScripts = previousVersion < 2
    ? scripts.filter(script => script.id !== 'builtin-script-podcast' || script.createdAt !== script.updatedAt)
    : scripts
  const existingScripts = new Set(retainedScripts.map(script => script.id))
  // Only seed presets introduced after previousVersion so prior user deletions stay deleted.
  const addedInVersion = new Map<string, number>([
    [nightRadio.id, 1],
    [suspenseDrama.id, 1],
    [productVideo.id, 2],
    [dailyComedy.id, 4],
    [englishListeningExam.id, 5],
    [battleThroughHeavens.id, 7],
  ])
  const missingScripts = createBuiltinStudioScripts(now).filter(script =>
    !existingScripts.has(script.id) && (addedInVersion.get(script.id) ?? 1) > previousVersion,
  )
  const existingRoles = new Set(roles.map(role => role.id))
  const cast = new Set(missingScripts.flatMap(script => script.lines.map(line => line.roleId)))
  const reusedRoleIds = new Map<string, string>()
  const missingRoles: StudioRole[] = []
  for (const role of builtinRoles) {
    if (!cast.has(role.id) || existingRoles.has(role.id)) continue
    const match = roles.find(saved => saved.name === role.name && saved.provider === role.provider
      && saved.model === role.model && saved.voice === role.voice && saved.voiceDesignPrompt === role.voiceDesignPrompt
      && saved.speechInstruction === role.speechInstruction && saved.voiceRate === role.voiceRate)
    if (match) reusedRoleIds.set(role.id, match.id)
    else missingRoles.push(role)
  }
  for (const script of missingScripts) {
    for (const line of script.lines) line.roleId = reusedRoleIds.get(line.roleId) ?? line.roleId
  }
  return { roles: [...roles, ...missingRoles], scripts: [...retainedScripts, ...missingScripts] }
}
