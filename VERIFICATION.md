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
