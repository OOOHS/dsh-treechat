# Windows 开发环境适配 — 2026-11-09

- Windows 本机 Node 24.14.0、npm 11.9.0，锁定 DSH 0.2.1-alpha.2。
- build、doctor 通过；功能与环境测试合计 39 项全部通过，无跳过。涵盖 Windows junction、命名管道及 TCP 管理通道认证、模型发送顺序和真实 DSH 插槽契约。停止测试显式等待回调，避免 Windows 管道响应时序造成误判。
- 真实宿主验证通过：未认证 401、认证交换 303、页面 200、TreeChat enabled/active、管理通道 ping 及受控关闭。
- 使用独立 profile；保留本机环境配置、凭据及聊天数据。未调用真实模型，未执行本轮浏览器分支端到端验收。
- 以下 macOS 实测为上游历史结果。

---

# Verification

Target host: DSH 0.2.1-alpha.2, macOS ARM64. TreeChat is a development release.

Run `npm run build` and `DSH_TEST_ROOT=/path/to/dsh-runtime npm test`.
The current suite passes 29 tests with the target runtime available. Host contract tests are skipped when that runtime is absent.

Coverage includes anchors and ambiguous matches, completed-message fork boundaries, branch metadata persistence and renaming, workspace filtering, model selection before first send, keyboard composition, tree layout and zoom handlers.

Manual integration checks covered real-model parent/child/nested conversations, isolated follow-up history, promotion, reload recovery, inline rename, context disclosure and tree navigation. Browser-local metadata and version-specific host integration remain compatibility constraints. Credentials and conversation histories are excluded from this repository.

Return-to-source navigation was checked on a selected phrase inside a long reply: the phrase centers in the visible message area above the composer. The 1.8-second outline now fades during only its final 0.45 seconds. Existing 29 tests pass; build passes.

Nested return: reproduced native embedded-session scroll restoration overriding the source-selection position. A brief, user-cancellable settling period now compensates delayed layout/restoration. Live child-to-parent navigation on an existing nested branch retained the centered selection after loading settled.

Return animation refinement: native restore is allowed to settle briefly before the source scroll begins. All source corrections now use smooth scrolling, with retries spaced apart; instant scroll-position writes were removed from this path. Live nested-return samples showed intermediate positions through the motion, and the final selection remained centered. 29 tests pass.

Breadcrumb navigation now opens the selected ancestor conversation at its latest messages. Live parent-branch and main-conversation breadcrumb navigation both reached bottomGap 0 without source highlighting. The left arrow retained source highlighting and selection centering; the current breadcrumb is noninteractive. Existing 29 tests pass.


## Windows 真实模型会话验证 — 2026-11-09

- 通过实际运行 DSH 的认证 RPC 创建独立测试主会话，使用原生 session/prompt、session/fork、session/selectModel；分支首问使用 TreeChat 的 branchPrompt 引用格式。未启用测试模型。
- deepseek-official / deepseek-flash 实际完成六次回复：主会话首问与追问、子分支首问与追问、孙分支首问与追问；子/孙分支均正确复述继承的共享暗号和背景。
- 只读核对本次三个会话的落盘日志：在完整 assistant/message 事件边界分叉，子/孙分支首问前显式模型选择与实际请求路由一致。主会话不包含子/孙追问，子分支不包含孙分支消息，子/孙均不包含主会话分叉后新增消息。
- 当前未提供浏览器操作工具；本轮验证的是原生 RPC 收发与持久历史，不包含 TreeChat 界面选区、侧栏、分支关系 localStorage 或点击流程验收。测试详情保存在被忽略的 .runtime/live-chat-check.json，不提交聊天正文或凭据。


## 服务端自动保存与旧树迁移 — 2026-11-09

- TreeChat 0.3.1-dev.1：分支图自动保存到 DSH_HOME/treechat/graph.json，以父/子会话 ID 关联原主会话。服务端采用串行变更、临时文件写入与同步后原子替换；不改写聊天日志。
- 浏览器启动时自动补入旧 v1 分支图，服务端已有同 ID 记录优先，原浏览器副本保留。保存失败不会显示为成功；自动刷新与聚焦恢复读取，多窗口同分支冲突拒绝覆盖。
- build、46 项测试、npm pack --dry-run 通过。新增检查覆盖主/子/孙旧树迁移、新浏览器恢复、服务重启、重复迁移、并发不同主会话、同分支过期写入拒绝、失败重试及损坏文件保护。
- 实际 DSH 认证接口验证通过：无认证 401、跨来源 403、插件 active；用上轮真实测试会话的分支关系模拟旧浏览器记录，迁移后另一认证客户端无本地数据仍恢复；重启服务后修订号及原会话关联保持一致。
- 未读取用户浏览器存储；真实旧树会在原浏览器刷新加载新版后自动迁移。当前无浏览器操作工具，未做完整选区/点击验收。测试详情及树文件仅保存在被忽略的数据目录。


### 现有树刷新恢复确认 — 2026-11-10

- 用户实际刷新当前浏览器后确认树仍在。
- 只读核对服务端现有树，共 4 条分支关系；新建无本地缓存的客户端再次加载，分支、父子关系、原文锚点完全一致，关联的 5 个会话日志存在，检查前后服务端文件未改变。
- 上述用户界面确认与接口核对共同补充刷新恢复证据；未逐项读取旧浏览器 localStorage，也未进行完整界面操作回归。
