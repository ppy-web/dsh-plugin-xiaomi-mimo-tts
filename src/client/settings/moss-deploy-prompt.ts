/**
 * Deployment prompt copied from the MOSS local voice panel.
 *
 * Keep this goal/address/direction oriented: it is handed to an agent that can
 * choose its own commands, so concrete shell snippets would only duplicate the
 * verified repository and deployment context.
 */
export const MOSS_DEPLOY_PROMPT = String.raw`目标：在 Windows 上部署 MOSS-TTS-Nano 本地 TTS 服务（非windows环境可参考），不使用管理员权限，不要 conda。服务最终监听 127.0.0.1:18083，供 DSH 插件通过健康检查、预热状态和合成接口接入。

资源：
- uv Windows 包：https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip
- 源码：https://github.com/OpenMOSS/MOSS-TTS-Nano
- 模型：OpenMOSS-Team/MOSS-TTS-Nano、OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano
- 建议目录：根目录 <根>；工具链 <根>\.tools\uv；虚拟环境 <根>\.venv；模型缓存 <根>\models\hf
- 服务地址：http://127.0.0.1:18083

步骤：
1. 用 uv 安装 Python 3.12、创建虚拟环境，并从源码安装项目。
2. 依赖中跳过 WeTextProcessing（Windows 没有 pynini 轮子），改用 wetext 提供中英文文本正则化。
3. 修改文本正则化入口：优先使用 tn，导入失败时回退 wetext；否则服务无法启动。
4. 修改流式合成的音频队列：去掉固定容量上限，避免客户端不消费时合成线程卡死。
5. 将两个模型权重下载到 HF_HOME，再运行 infer.py 做冒烟测试，确认输出 WAV 有效。
6. 启动 app.py 监听 127.0.0.1:18083；预热完成后确认 /health、/api/warmup-status、示例音色和一次 /api/generate 合成均成功。
7. 页面界面全部改为中文。
8. 关闭流式生成，设为默认关闭。
9. 本地克隆音色可保存到音色列表，支持改名和删除。
10. 只做必要改动，记录实际路径、端口和启动方式。`;
