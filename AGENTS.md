# TreeChat 开发约定

本目录为可修改的插件源码。先读 README.md、CODEX_HANDOFF.md 和 VERIFICATION.md 的最新段落。

- 以 package-lock.json 中固定的 DSH 0.2.1-alpha.2 实现与类型为准，不修改 node_modules 内的宿主核心。
- 修改 src/ 后运行 npm run build；lib/client.js 是生成产物。运行 npm test 验证，再按变更范围做实际界面复验。
- npm run setup 准备环境，npm run dev 启动独立 profile，npm run doctor 检查，npm run restart 安全重启。不要硬编码某台电脑的路径。
- 凭据、.env、.runtime、聊天内容和访问令牌不加入归档或版本库。不要搜集无关目录的密钥。
- 区分真实模型、明确标记的测试模型、纯自动化检查；受限环境跳过的集成项应如实记录。
- 用户希望直接完成授权范围内的必要准备与修复，避免重复确认。
