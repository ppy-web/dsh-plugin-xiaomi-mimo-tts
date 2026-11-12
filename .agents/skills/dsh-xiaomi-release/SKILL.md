---
name: dsh-xiaomi-release
description: 为本仓库 dsh-xiaomi-tts 准备版本、创建或核对 Git tag、汇总上个 tag 以来的新功能并更新版本引导、撰写和发布 GitHub Release，遵循历史中文发布格式及 tag 触发的 npm 发布流程。适用于准备发版、预发布和发布失败核对；普通代码修改或仅生成 commit message 不触发。
---

# 小米 TTS Release 与 Tag 规则

仅用于 `ppy-web/dsh-plugin-xiaomi-mimo-tts`，npm 包名为 `dsh-xiaomi-tts`。先读取根目录 `AGENTS.md`、`package.json` 和 `.github/workflows/release.yml`，以当前仓库配置为准。撰写发布说明时再读 [发布说明模板与历史依据](references/release-notes.md)。

## 确定版本与变更范围

- 查看工作区、当前分支、远端 tag、GitHub Releases 和 npm 已发布版本；本地最大 tag 或 GitHub 页面显示的 Latest 都不能单独决定下一版本。可用 GitHub 连接器或 `gh api` 读取远端资料。
- 用户指定版本时优先采用，并检查 SemVer、是否已占用及发布渠道。未指定时，结合现有 `package.json.version`、未发布的变更和用户意图提出版本；不要机械地在旧 Release 上加一，也不要把开发中版本当作已发布版本。
- 项目历史包含稳定版 `v3.0.8` 和预发布版 `v3.0.4-alpha`。后续递增预发布序号可采用 `-alpha.1`、`-alpha.2`，这是建议，不是已有 tag 必须改名的理由。按变更影响选择 major/minor/patch；历史中 patch 也包含新功能，不能据此推导强制升级规则。
- 根据目标发布线选择前一个已发布 tag，检查 `git log <previous-tag>..<target-commit>` 和实际 diff，再归纳本次新增、修复、兼容性及安装影响。不要把历史功能重复列为本次新增，也不要仅按提交标题编造行为。

## 版本新功能引导

准备版本时，先从上一个 tag 到当前目标提交的全部提交中提炼新功能，再更新启用弹窗中的「版本新功能」。仅核对已发布版本或恢复失败发布时，不改写既有 tag 对应的源码；只写 Release 草稿时提供引导候选文案，不额外修改产品文件。

- **范围**：使用上节确认的发布线与前一个 tag，目标默认为当前 `HEAD`，用户指定提交时以该提交为准。检查 `git log --reverse --format=fuller <previous-tag>..<target-commit>`、`git diff --stat <previous-tag> <target-commit>` 和相关实际 diff。完整读取范围内提交，不用 `--first-parent`、`--no-merges`、`--grep=feat` 或条数限制代替检查；合并带入的功能也要覆盖。不能按 tag 名字或创建时间直接选一个不属于目标历史的 tag；目标已有发布 tag 时排除该目标 tag，向前选基线。没有可用 tag 时检查目标的全部历史并说明是首次发布。
- **归纳**：结合提交正文、最终源码和手册，提取用户可感知、当前仍存在的新能力。按功能合并重复提交，剔除已回退或移除的功能，以及上个 tag 已有的能力；不要把提交标题直接复制成文案。工作区未提交内容单独核对，只有明确纳入本次发布且最终进入目标提交的功能才能写入正式引导。
- **文案**：每项只用一句简短的话介绍一个值得注意的新功能，说明用户现在能做什么；每项前显示一个 🎉。不包含 bug 修复、依赖更新、内部重构、测试、CI 或普通文档维护。优先突出主要功能，不按提交逐条罗列，也不为了固定条数拆分同一功能。若本次没有符合条件的新功能，明确说明，不把修复包装成新增，不沿用上版条目。
- **落点**：更新 `src/client/settings/activation-guide.tsx` 中的功能列表和 `src/client/localization.ts` 的中英文 `onboarding.feature*` 文案，并同步 `src/client/locales/ja.ts`、`src/client/locales/fr.ts`。新增、替换或删除条目时保持组件与各语言键一致；🎉 由列表组件统一添加，不在译文中重复写入。维护现有实现，不把当前版本的三个示例功能固化为以后每版必填内容。
- **布局与核验**：沿用 `src/client/style/plugin-surfaces.css`，不要因条目增加放宽高度。检查桌面和窄屏的可读性、滚动及按钮可达性。运行下节发布检查，回报比较基线、目标 SHA 和最终入选的新功能；每项应能追溯到本次提交及实际功能，提交哈希无需展示在弹窗中。GitHub Release 正文仍可按模板包含修复和兼容性说明，不能直接整段复用到新功能引导。

## Tag 与渠道

| 项目 | 规则 |
| --- | --- |
| Git tag | 严格等于 `v${package.json.version}`，使用小写 `v` |
| GitHub Release 标题 | 与 tag 相同，例如 `v3.0.8` |
| 稳定版 | 版本不含预发布标识；GitHub `prerelease=false`；npm `latest` |
| 预发布版 | 去掉 `+` 构建元数据后仍含 `-`；GitHub `prerelease=true`；npm `next` |
| tag 目标 | 已确认且通过验证的具体提交，包含该版本的源码和版本声明 |

历史同时存在 lightweight 和 annotated tag。新建时建议使用 annotated tag，注释可用 `Release v<version>`；不追改历史格式。默认沿当前 `main` 发布线，用户指定维护分支或提交时尊重目标，不自动合并其他分支。

创建前检查本地及远端同名 tag，并用 `git rev-parse <tag>^{commit}` 等方式比较实际提交。已有 tag 指向正确提交时复用；指向其他提交、包版本冲突或目标不明确时停止相关发布操作并报告差异，不覆盖、删除或强推旧 tag。仅推送本次目标 tag，不使用 `git push --tags`。

## 版本同步与验证

准备版本时检查这些维护点，按实际变更同步：

- `package.json.version` 与 `src/constants.ts` 的 `TTS_VERSION`。
- `tools/scripts/dsh-profile-verify.mjs` 的预期安装版本，以及 README 的版本化安装、重装示例。
- DSH 兼容声明取自 `package.json.engines.dsh` 和相关 peer dependencies；开发依赖与锁文件用于确认开发基线。声明兼容范围、开发基线、实际安装验证结果分别说明，不把其中一项当成另一项的证明。
- 修改依赖时同步 `pnpm-lock.yaml`，不为单纯版本号调整无意义地重写锁文件。不编辑生成目录 `lib/`、`.preview-dist/`。

在发布目标源码上运行并记录实际结果：

```powershell
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run release:check
pnpm run dev:build
pnpm run pack:check
git diff --check
```

`release:check` 当前调用 `pnpm test`，已含构建和全部 `test/*.test.mjs`，无需重复运行同一套测试。Node/pnpm 版本跟随当前 CI；建立本 skill 时为 Node.js 24、pnpm 11.22.0。

`pack:check` 包装 `pnpm pack --dry-run` 并恢复原始 manifest，优先用它检查包内容。实际打包使用 `pnpm pack --pack-destination <临时目录>`；核对 tarball 包名、版本、构建入口及本次涉及的资源，确认包内无安装生命周期脚本，且工作区 `package.json` 的 scripts 已恢复。打包中断时先检查 `.package-scripts-backup.json` 与现有恢复脚本，不盲目再次打包覆盖备份。项目发布 skill 属于 `.agents/`，不应混入随包发布的 `skills/` 角色预设。

只有具备所需 DSH 环境并实际运行 `pnpm run profile:check`、安装检查或人工播放测试，才能声称它们通过。测试数量、兼容版本和限制均取自本次结果，不沿用旧 Release 的数字或旧 smoke 脚本。

## 发布流程与失败恢复

“创建规则 skill”“准备发版”“写 Release 草稿”仅完成相应文件、检查或草稿；不据此推送 tag 或发布 npm。用户明确要求实际发布时，已有授权覆盖其指定范围，完成准备后继续执行，不额外添加重复确认。

当前流程的关键副作用：**向远端推送 `v*` tag 会触发 `.github/workflows/release.yml`，自动向 npm 发布。** 工作流使用 npm Trusted Publishing/OIDC、provenance 和 public access；不要另行本地 `npm publish`，也不要索要或写入 npm token。工作流拒绝将稳定版 `latest` 回退到更低版本。

实际发布按以下依赖关系推进：

1. 确认发布文件已提交，目标 SHA 正确，相关验证通过。保持用户其他未提交修改原样；不把它们夹带进发布提交。若用户要求准备 release commit，可使用 `release: prepare dsh-xiaomi-tts <version>` 作为项目现有风格的示例。
2. 为明确的 SHA 创建或复用 tag；推送这一个 tag，跟踪与该 tag、SHA 对应的发布工作流结果。
3. 确认 npm 上该确切版本已存在、渠道符合预期，再完成面向用户的 GitHub Release。创建时复用已经存在的 tag；使用 `gh release create --verify-tag` 或等效机制，避免 GitHub 隐式创建指向错误提交的 tag。
4. 按模板提交中文正文、对应的 prerelease 标记和 compare 链接。当前工作流仅发布 npm，不会自动创建 GitHub Release，也不会上传附件。附件并非硬性要求；用户要求或选择提供时，再准备对应目标提交的 `dsh-xiaomi-tts-<version>.tgz` 并核对版本及内容。GitHub 自动提供的源码归档不能当作该 npm 安装包。
5. 回报版本、tag/目标 SHA、GitHub Release 链接、npm 渠道、验证结果和未完成项。

调用超时、工作流失败或结果不明时，先读取远端 tag、现有 Release、Actions 日志及 npm 确切版本，确定已完成哪一步。已存在的正确发布结果应复用；npm 已发布则不要重复发布。需要重试时只恢复失败阶段；涉及覆盖既有 tag、替换已发布版本、回退渠道或修改用户未授权内容时，报告具体状态并取得相应指示，不删除重建 tag 来触发重试。
