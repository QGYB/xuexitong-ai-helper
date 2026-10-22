# 学习通 AI 助手（xuexitong-ai-helper）

Playwright 驱动本机 Edge，在课程播放页注入视频与章节练习脚本；本地服务使用 Jev 优先、OpenAI 兼容 API 或 WorkBuddy 云服务兜底的策略生成答案。

> 本项目仅供学习交流与自动化技术演示，严禁用于正式考试、违法违规用途或违反学校及平台规则的行为。自动化可能触发账号风控，使用者应取得必要权限并自行承担使用责任。原创部分禁止商用，采用[自定义非商业源码许可](LICENSE)，不宣称是标准 LGPL 开源许可。

## 环境与安装

- Node.js **≥22.12.0**。在终端使用 `node`、`npm ci` 或 `npm test` 时，Node 及 npm 需要能从该终端的 PATH 调用；安装后请重新打开终端。
- 本机 Microsoft Edge；不需要下载 Playwright 的 Chromium。
- Jev 访问受网络影响；默认 HTTP 代理为 `http://127.0.0.1:7897`，不是私人代理地址。

```powershell
npm ci
npm test
```

若 Node 由 IDE/宿主应用内置提供，开发工具终端与资源管理器双击时的 PATH 可能不同。在普通 PowerShell 中运行 `where.exe node` 和 `node --version` 核对；终端能用不代表双击入口也能找到。宿主内置 Node 不一定带 npm，安装依赖仍需可用的 npm。

依赖精确版本与传递依赖由 package-lock.json 锁定。测试使用合成配置、模拟上游和临时本地端口，不需要真实 API Key、学习通登录或 Edge，不会真实答题提交。

Node 22 的原生测试器存在[非 ASCII 日志序列化问题](https://github.com/nodejs/node/issues/65934)，测试入口对 Node 22 使用单进程模式，Node 24 保留默认文件隔离；两者都会执行全部测试并传递失败退出码。

## 配置方式 A：Jev + OpenAI 兼容兜底

```powershell
Copy-Item config.example.json config.json
```

编辑 config.json，填写自己的配置，不提交该文件：

```json
{
  "jev": {
    "apiKey": "你的 Jev Key",
    "proxy": "http://127.0.0.1:7897",
    "model": "jev-latest",
    "confidenceFloor": 0.6,
    "noulProbabilityFloor": 0.6
  },
  "fallback": {
    "baseUrl": "https://api.deepseek.com",
    "apiKey": "你的兼容 API Key",
    "model": "deepseek-chat"
  }
}
```

Jev Key 留空时可仅使用兜底；JEV_API_KEY 是 Key 的环境变量后备。jev.proxy 可用 JEV_PROXY 作为后备；显式设为空字符串表示直连。价格、可用模型和额度以对应服务官方面板为准。

单选、判断使用 Choice 的 confidence 与 confidenceFloor 比较。多选按完整题干及选项拆成 Noul 判断，读取官方 `noul` yes 概率：默认 ≥0.6 选中、≤0.4 不选；两者之间表示不确定，整题交给兜底。这与 Choice confidence 是两个不同概念。noulProbabilityFloor 必须大于0.5且不超过1。

## 配置方式 B：WorkBuddy 云服务

在 WorkBuddy 为应用开通云服务，将公开配置按 wb-public-config.example.json 存为 wb-public-config.json；LLM 客户端实际读取字段是 `endpoint` 和 `publishableKey`。`resourceId` 用于标识应用，当前代码未读取；`oauthRelayBaseUrl` 用于 OAuth 流程，当前无该登录流程，不传给 LLM 客户端。

此方式不必申请兼容 API Key。publishableKey 标识应用，不是 Jev/模型服务私钥；仍应遵守后台权限、认证域及额度设置，不要公开个人配置文件。

可选 Jev 配置同 A：若有 config.json 则读取 jev 段；没有该文件也可通过 JEV_API_KEY/JEV_PROXY 启用 Jev。jev.model、confidenceFloor、noulProbabilityFloor 在两个服务变体中一致。

云服务模型在首次兜底时从可用模型目录选择，优先顺序为 deepseek-v4-flash、glm-5.3-flash、deepseek-v4.1-flash、auto、default，再选轻量模型或首个可用模型。可用 `WB_MODEL` 显式指定；模型是否可用以后台实际响应为准。

## 配置方式 C：只用 Jev

保留 config.json 的 jev 段，**删除整个 fallback 段**。单选/判断低置信度、多选不确定、缺少选项响应或调用失败时，服务会报错并停止该批自动提交，不回用低置信度答案。仅设置环境变量时，通用服务仍需要一个 config.json（可以是 `{}`）。

## 启动与关闭

双击 `启动学习通AI挂机.cmd`，或运行：

```powershell
npm start
```

Windows 双击入口会通过 `_find-node.cmd` 依次查找 PATH、官方64位/32位安装目录、用户级 `Programs/nodejs` 和当前用户 WorkBuddy 的 Node 版本目录，使用首个实际可运行且满足 ≥22.12.0 的版本；不按目录名猜版本，不保证选择最高版本。启动窗口会显示选中的 Node 路径，查找失败或启动器报错时保留窗口供排查。此探测只适用于 `.cmd` 入口，`npm start` 仍依赖当前终端的 PATH。

若只使用宿主内置 Node，宿主卸载或移动后可能需要重新安装 Node；入口不会自动下载 Node、安装依赖或修改系统 PATH。工作模式和实例参数仍可传入原入口，例如 `启动学习通AI挂机.cmd 2 --workbuddy`。

只有 config.json 时自动选择 A/C；只有 wb-public-config.json 时自动选择 B。两个文件都有或都没有时必须明确选择，避免把 B 的配置误用于 A：

```powershell
node wb-launch.mjs --openai
node wb-launch.mjs --workbuddy
```

启动器只复用 `/health` 返回200、协议/身份/模式一致的服务，端口37841被其他程序占用会报错。若启动器自己启动了服务，该服务在后台持续运行，关闭浏览器不会停止它；启动器会显示服务 PID。所有浏览器关闭后，可在任务管理器核对命令行为 wb-answer-service.mjs 或 wb-answer-service.workbuddy.mjs，再结束对应服务进程；不要批量结束其他 node 进程。

需要可见服务日志或进行验收复测时，建议用两个终端手动运行：

```powershell
node wb-answer-service.mjs
# 或 node wb-answer-service.workbuddy.mjs
```

```powershell
node wb-runner.mjs --openai
# 或 node wb-runner.mjs --workbuddy
```

服务终端 Ctrl+C 停止服务；runner 的 SIGINT/SIGTERM、正常关闭浏览器会请求关闭浏览器并释放所属实例的 PID 文件。启动器通过 IPC 请求 runner 正常关闭，8秒无响应才强制终止；强制终止或无法确认浏览器关闭时仍可能保留锁，先核实浏览器/旧进程已停止再处理。服务重启后刷新课程页即可从新服务获取新令牌脚本。

首次在 Edge 中扫码登录，随后进入课程页。支持 `/mycourse/studentstudy` 和 `/mooc2-ans/mycourse/studentstudy` 两种路径。浏览器档案保存在 edge-profile/，不与日常 Edge 档案共用。

通过本工具启动的 Edge 会在网页右下角常驻学习助手状态栏，登录页和课程目录也会显示；刷新、跳转或网页替换内容后自动恢复。进入支持的章节学习页后，“一键开始做题”按钮可用；答题结束或停止后保留状态栏。浏览器自身的设置页、工具栏等受保护界面不属于网页注入范围。已有浏览器实例需要关闭后通过本工具重新打开，才能加载更新后的启动注入。

## 默认脚本与恢复边界

课程右下角状态文字左侧提供 **一键开始做题**：可直接处理当前已打开的测验，或尝试打开当前章节的测验页签；不必先由脚本播放完视频。仅处理平台允许作答的当前章节，保留单选、多选、判断、完整性检查及有限重试。提交并确认当前成绩后停留在本节，不自动切到下一节；继续自动挂机可刷新课程页。

按钮也可在控制器已停止后重新尝试当前测验。进行中重复点击不会重复请求或提交；手动切换章节会取消本次独立答题。找不到当前测验、题目结构无法确认或服务不可用时显示原因，不能绕过平台限制。独立 V3 没有本地答题能力，因此不显示此按钮。

默认由 `deepseek-console/xuexitong-console.js` 统一驱动播放、切节和答题；**保持平台默认播放速度**，不是自动1.5倍。修改 V3 的 playbackRate 不影响默认模式。浏览器部分由本项目独立编写的 browser/course-engine.js 生成两个入口，使用原生 DOM API，不依赖 jQuery 或上游脚本。

runner 设置唯一 console 驱动标志。V3 默认不注入；`V3_ENABLED=1` 是保留的兼容装载开关，V3 发现 console 驱动后会退出，不同时运行两个播放器。独立 V3 可单独播放视频、查找测验页签并等待当前测验完成；默认1.5倍速，不会替你答题或超时跳过测验。不能把它理解成双脚本组合。

连续视频/连续测验通过新文档、iframe或播放器身份判断是否切换完成，不能只看“视频/测验”标题。无法确认新内容时会安全停止。提交后等待成绩/任务完成标记，默认10分钟警告、15分钟停止等待，**不会因超时跳过未完成测验**；对应 app.configs.quizCompletionWarningMs 和 quizCompletionTimeoutMs（也支持 quizWarnMs / quizStopMs）。页面结构、跨源 iframe 或任务完成标记变化可能需要人工检查。

本地答题请求的总截止为14分钟，Jev单次30秒、兜底单次120秒；页面请求上限15分钟。兜底最多两次尝试：坏 JSON、缺题/无效选项、网络/5xx、400/422/429可重试；通用 API 第二次去掉 response_format。401/403等授权错误不重试。WorkBuddy 两次流式尝试都有截止。重试耗尽后报错，禁止回用不可信的旧答案。

## 多实例（本地功能，真实多开待验收）

```powershell
node wb-runner.mjs 1 --openai
node wb-runner.mjs 2 --openai
```

实例号仅允许1～99的规范整数；1使用 edge-profile/，其他使用 edge-profile-N/。同一实例通过独占 runner-N.pid 锁避免争用。强制杀进程后可能遗留锁，先确认旧 runner 和对应浏览器均已停止，再手动删除所属 runner-N.pid；不要仅凭 PID 数字判断进程身份。所有档案与 PID 均被 .gitignore 排除。

多个实例共享一个本地服务，当前仍按批互斥，忙时返回429。服务端没有队列；页面会按下文的有限重试策略处理429，重试耗尽后仍停止。同时进入测验的实例可能需要人工恢复。验收复测之前，不宣称多实例完整链路或多账号协同通过。

## 本地协议与敏感信息

- 服务仅监听 IPv4回环 `127.0.0.1:37841`，校验回环来源与 Host。
- runner 的无凭据 `GET /health` 获取200身份信息，然后 `GET /script` 获取同一 sessionId 的脚本。两端点不开放跨站 CORS；/script 拒绝 Origin 和浏览器 Fetch Metadata，返回 JSON、no-store、nosniff，不可作为跨站脚本载入。
- 随机令牌每次服务启动生成，只在内存和运行时响应中传递；磁盘源码永久保留 `__LOCAL_TOKEN__`。页面 `/health` 和 `/answer` 仍校验 HTTPS Chaoxing Origin 与令牌。
- Playwright 绑定仅向可信顶层课程页交付脚本，每次新文档重新核对健康和脚本会话；源码不写入任意站点的全局变量。
- 同一主机的其他程序不是这套回环协议抵御的攻击者；它们可访问本地 bootstrap。API Key 不传入浏览器，只由 Node 服务读取配置/环境变量。
- 私密配置、环境文件、所有 edge-profile-*、会话导出、PID、日志及 node_modules 被忽略；忽略规则不能替代发布前秘密扫描。

## 验证与目录

`npm test` 覆盖答案协议、兜底完整性、真实合成本地 HTTP、Origin/令牌/Host、会话更新、注入边界、导航与销毁状态。它不验证真实学习通 DOM、Edge 本地网络权限、账号、付费上游、代理、云额度或平台许可。需要用户在自己的授权环境验收。

`node wb-jev-test.mjs` 是可选实网自测，会使用本地 Key 发出一道已知答案请求；普通测试不会调用它。

| 文件 | 作用 |
|---|---|
| wb-answer-service.mjs | Jev + 兼容 API 服务 |
| wb-answer-service.workbuddy.mjs | Jev + WorkBuddy 服务 |
| wb-service-core.mjs | 答案策略、校验、回环协议 |
| wb-runner.mjs / wb-runner-runtime.mjs | Edge、注入、健康会话、实例锁 |
| wb-launch.mjs / 启动学习通AI挂机.cmd / _find-node.cmd | Node 探测、启动与模式选择 |
| browser/course-engine.js | 独立编写的播放器、测验与导航源文件 |
| scripts/build-browser.mjs | 生成或只读核对两个浏览器入口 |
| deepseek-console/xuexitong-console.js | 生成的视频/答题统一驱动 |
| xuexitong_v3.user.js | 生成的独立 V3 播放器 |
| tests/ | 无真实凭据回归测试 |
| config.example.json / wb-public-config.example.json | 本地配置模板 |
| package-lock.json | 精确依赖锁 |

## 浏览器开发与边界

修改 browser/course-engine.js 后运行 `npm run build:browser`；`npm run check:browser` 只读验证生成物与源码一致。两个入口不分别手工修改。

支持单选、多选和判断题。选项须有可验证的原生 checked、aria-checked，或同题隐藏答案字段状态；判断题支持 true/false 存储，多选支持组合字母。父容器的 aria-hidden 不单独视为视觉隐藏，CSS 隐藏和不可操作选项仍被拒绝。无法验证实际选择结果时停止提交。

答题服务暂时不可用、限流、5xx、响应 JSON 损坏或请求超时，会在当前题目未变化且尚未应用答案时自动重试：默认间隔 3 秒，最多重试 3 次。已开始提交的操作不会自动重放。完整题量未加载时先等待，未知题型和数量不符均停止。

提交确认支持当前测验及祖先课程文档中的平台弹窗；已有可见弹窗不被误确认。批阅页面保留题目、判断题仅显示答案和分数时，也可识别当前成绩并继续下一节播放。真实平台改变 DOM 后应先复测。

部分课程对可作答页使用字体混淆，DOM 文字与屏幕显示不同；本项目尚未实现字体解码。模型可能给出错误答案，任务点完成不等于满分，请核对成绩。

自动跨整页恢复由 runner 在每个新文档重新取得脚本实现。脱离 runner 直接在控制台粘贴时，整页跳转后需重新注入；不创建保存源码/令牌的辅助弹窗。

本仓库只分发脚本及其源码、测试、运行依赖声明和文档。本地 Web/原生控制台、多开前端及 EXE 打包文件不属于本发布包；脚本 runner 的实例参数仍可使用。

## 来源与许可

- 浏览器脚本由本项目按行为规格独立重写；实现者未读取旧脚本或上游源码。公开历史只包含替换后的版本，核对记录见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- [ocsjs/ocsjs](https://github.com/ocsjs/ocsjs)：仅致谢、未包含；核对的5.0分支为MIT。
- [TypeSafe AI](https://typesafe.ai/)：Jev接口提供方；Noul/Choice协议以[官方 OpenAPI](https://api.typesafe.ai/openapi.json)为准。

原创部分采用 [LICENSE](LICENSE) 中的自定义非商业许可。第三方代码、依赖和商标不被重新授权。免责声明、署名及“要求后移除”都不代替学校/平台许可或上游版权授权。
