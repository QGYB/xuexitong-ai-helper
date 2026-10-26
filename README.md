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

云答题默认使用 **`deepseek-v4-flash`**，无需设置模型环境变量，配好 WorkBuddy 公共配置后按下面命令启动即可。它在本项目2026-10-23的108题同题对照中取得最高分102/108（94.44%），本轮另一个候选为Pro；这是一次有限测量，不保证其他课程也有相同正确率。模型在首次云兜底时校验账号可用目录，并在服务进程内固定；Jev 已成功作答的题不调用云目录或云推理。

```powershell
node wb-launch.mjs --workbuddy
```

账号没有默认模型或模型已被禁用时，云答题返回422并提示默认模型不可用，不静默改用未经评测的模型。高级用户可选用 `WB_MODEL` 覆盖默认值：

```powershell
node scripts/evaluate-workbuddy.mjs --config wb-public-config.json --list-models
$env:WB_MODEL = 'deepseek-v4-pro' # 可选：先确认自己的模型目录中存在这个 ID
node wb-launch.mjs --workbuddy
```

显式指定的模型不可用也会422暂停；更换模型需重启答题服务。`WB_MODEL` 只作用于当前 PowerShell 及其子进程，在另一个窗口双击 `.cmd` 不会继承它；删除自己的覆盖变量后恢复默认，不必改认证配置。模型取舍应依据同题实测，名称和单次成绩不能证明正确率。

云模式使用独立答题指令，保留否定词、数字和题型，多选检查漏选/错选，判断先确认真假再匹配字母。遇到乱码、缺失内容或无法区分的重复选项会暂停；云模型主动返回空答案时也暂停，不强迫补猜。页面题干/选项中的图片、公式、私用区乱码会在发送前拦截，当前文字接口不能理解这些内容。通过结构检查的答案仍可能答错。

可选脱敏诊断：在启动服务前设置 `$env:WB_DIAGNOSTICS = '1'`，默认关闭。服务将请求 ID、题目与选项哈希、题型、上游、模型 ID、尝试次数、答案字母、耗时及上游实际返回的 token 用量写入 `logs/answer-diagnostics.jsonl`；约5MB滚动一次，仅保留当前文件及 `.1`。没有上游模型版本/token 数据时不虚构。不会记录完整题面、Key、Cookie 或页面 URL。新脚本的浏览器控制台同时输出相同请求 ID、返回字母、选项文本哈希、核验后的选中状态及可确认的保存值；无法确认的保存值为 null。浏览器日志是尽力记录，导航可能打断它，日志失败不影响答题。关闭变量并重启服务、刷新课程页即可关闭新诊断。

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

通过本工具启动的 Edge 会在网页右下角常驻学习助手状态栏，登录页和课程目录也会显示；刷新、跳转或网页替换内容后自动恢复。进入支持的章节学习页或单题答题页后，“一键开始做题”按钮可用；答题结束或停止后保留状态栏。浏览器自身的设置页、工具栏等受保护界面不属于网页注入范围。已有浏览器实例需要关闭后通过本工具重新打开，才能加载更新后的启动注入。

状态栏还提供 **重新启动**：重建当前页学习助手，保留当前课程位置、登录及章节自动学习/单独答题方式。它会取消旧控制器尚未完成的请求，旧响应不会继续选题或提交；不重启浏览器或后台答题服务。测验已经提交、正在等待平台确认时暂时禁用，避免重复提交；页面离开或答题模式不匹配时也不可用。单题答题页重启后回到待机，需要再次点击“一键开始做题”。服务或脚本更新后仍需重启服务并刷新课程页加载新脚本。

## 默认脚本与恢复边界

状态栏提供 **模式：章节测验 / 考试答题** 切换按钮，初始按页面路径选择。切换时停止当前答题；模式与页面不对应时禁用开始按钮并说明原因，不把两种页面交给同一套 DOM 提取逻辑。

课程右下角状态文字左侧提供 **一键开始做题**：可直接处理当前已打开的测验，或尝试打开当前章节的测验页签；不必先由脚本播放完视频。仅处理平台允许作答的当前章节，保留单选、多选、判断、完整性检查及有限重试。提交并确认当前成绩后停留在本节，不自动切到下一节；继续自动挂机可刷新课程页。

按钮也可在控制器已停止后重新尝试当前测验。进行中重复点击不会重复请求或提交；手动切换章节会取消本次独立答题。找不到当前测验、题目结构无法确认或服务不可用时显示原因，不能绕过平台限制。独立 V3 没有本地答题能力，因此不显示此按钮。

考试答题模式适配 `/exam-ans/exam/test/reVersionTestStartNew` 的单题视图，用于获授权的练习/测试。首次进入保持待机，点击后复用同一本地答题服务，支持单选、多选、判断及显示字母与内部保存值打乱的选项。点击平台“下一题”保存当前答案并翻页，在同一标签页通过短期 sessionStorage 进度继续；进度不保存令牌、源码或模型答案。切换试卷、异常响应、未知题型或停止操作会取消继续。该模式不点击整卷提交按钮，末题交给用户检查并手动交卷。

默认由 `deepseek-console/xuexitong-console.js` 统一驱动播放、切节和答题；**保持平台默认播放速度**，不是自动1.5倍。修改 V3 的 playbackRate 不影响默认模式。浏览器入口由独立编写的 browser/course-engine.js、browser/exam-engine.js 和共享状态栏生成，使用原生 DOM API，不依赖 jQuery 或上游脚本。

runner 设置唯一 console 驱动标志。V3 默认不注入；`V3_ENABLED=1` 是保留的兼容装载开关，V3 发现 console 驱动后会退出，不同时运行两个播放器。独立 V3 可单独播放视频、查找测验页签并等待当前测验完成；默认1.5倍速，不会替你答题或超时跳过测验。不能把它理解成双脚本组合。

连续视频/连续测验通过新文档、iframe或播放器身份判断是否切换完成，不能只看“视频/测验”标题。无法确认新内容时会安全停止。提交后等待成绩/任务完成标记，默认10分钟警告、15分钟停止等待，**不会因超时跳过未完成测验**；对应 app.configs.quizCompletionWarningMs 和 quizCompletionTimeoutMs（也支持 quizWarnMs / quizStopMs）。页面结构、跨源 iframe 或任务完成标记变化可能需要人工检查。

部分课程包含仅作目录标题、没有内容的章节。自动学习模式遇到内容区明确显示“暂无内容”时，会确认页面和可见子框架加载完成、没有待处理视频/测验或加载错误，并等待默认5秒的稳定期后进入下一节；已读取的任务数非零或格式不明时继续等待。仅看到任务数0、暂时找不到播放器、侧栏提示为空、子框架不可读取或仍在加载，都不会被当作空章节跳过。支持连续空章节；切换后必须出现新的内容或可核对的新空章节状态，不能凭URL变化反复点下一节。单独答题模式保持完成后停留的边界。

支持播放器 iframe 内的 **视频弹题**（`.ans-videoquiz`）：弹题优先于视频播放处理，复用现有答题服务完成单选、多选或判断，核验原生选中状态后点击该弹题的“提交”；平台显示“继续学习”时再点击，确认弹层关闭后继续同一个视频。不会把弹题当作章节测验去等待成绩、切换页签或进入下一节，也不会在等待答案时消耗播放重试次数。单选/判断兼容选择后由平台自动关闭弹层的情况；多选须有独立提交按钮，避免提交不完整选项。

视频弹题沿用有限网络重试、请求截止、题面检查和过期答案取消。题型或题干尚未加载完整时先等待，默认加载上限2分钟；平台反馈未通过、题型/控件不明、多个可见弹题或题目在请求期间改变时暂停供用户核对，不猜其他选项、不强行关闭弹层、不快进绕过题目。“一键开始做题”也可处理当前视频弹题，完成后停留；独立V3仅等待用户手动完成。脚本更新需重启答题服务并重新加载页面；“重新启动”按钮重建当前已加载版本，不会自行读取磁盘更新。

本地答题请求的总截止为14分钟，Jev单次30秒；页面请求上限15分钟。兜底最多两次尝试：坏 JSON、缺题/无效选项、网络/5xx、上游400/422/429可重试；通用 API 第二次去掉 response_format，单次120秒。401/403等授权错误不重试。WorkBuddy 的目录获取和两次流式尝试共享120秒截止；本地输入不完整、模型未明确选择或主动空答案使用422停止，不进行格式重试。重试耗尽后报错，禁止回用不可信的旧答案。

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
- Playwright 绑定仅向 HTTPS Chaoxing 顶层章节学习页及上述精确单题答题路径交付脚本；考试说明页、相似后缀路径和子框架均不交付。每次新文档重新核对健康和脚本会话，源码不写入任意站点的全局变量。
- 新版 Edge 的 Local Network Access 权限可能拦截网页访问回环服务，表现为“本地服务健康检查超时”。runner 在上述合法顶层页面注入前，仅为当前 HTTPS 来源设置 `loopback-network` 权限；较早的 LNA 浏览器回退到同一来源的 `local-network-access`。不会全局关闭 LNA 检查，不修改系统策略、正常 Edge 档案、相机等其他权限。更新后需要关闭并重新启动本项目浏览器实例，单独刷新旧实例不会加载新的 runner。企业策略仍可能阻止授权，此时需管理员处理。
- 同一主机的其他程序不是这套回环协议抵御的攻击者；它们可访问本地 bootstrap。API Key 不传入浏览器，只由 Node 服务读取配置/环境变量。
- 私密配置、环境文件、所有 edge-profile-*、会话导出、PID、日志及 node_modules 被忽略；忽略规则不能替代发布前秘密扫描。

## 验证与目录

`npm test` 覆盖答案协议、兜底完整性、真实合成本地 HTTP、Origin/令牌/Host、会话更新、注入边界、导航与销毁状态。它不验证真实学习通 DOM、Edge 本地网络权限、账号、付费上游、代理、云额度或平台许可。需要用户在自己的授权环境验收。

`node wb-jev-test.mjs` 是可选实网自测，会使用本地 Key 发出一道已知答案请求；普通测试不会调用它。

`node scripts/check-local-network.mjs` 是可选的 Edge 本地网络权限复测（Edge ≥145）。它短暂打开临时浏览器档案，使用伪造 HTTPS 页面和合成回环服务，验证拒绝权限时失败、runner 授权后 `/health` 与 `/answer` 成功、相机与其他来源权限不变；不读取用户配置、不登录账号，也不调用付费上游。

云答题同题评测工具默认只生成离线题号清单，不调用模型。随仓库附带60道独立编写、答案由规则计算的合成题，不能代表真实课程知识水平。开发集/留出集按固定哈希划分，选项顺序保留；提示词调整应只用开发集。也可用 `--dataset` 指定自己的带标准答案 JSON（`{cases:[{id,type,question,options:[{id,text}],gold:[选项id]}]}`），标准答案和评测标签不会发给模型。

```powershell
node scripts/evaluate-workbuddy.mjs --models deepseek-v4-flash,deepseek-v4-pro
# --run 才会产生云推理用量；先确认额度、候选模型和数据使用权限
node scripts/evaluate-workbuddy.mjs --config wb-public-config.json --models deepseek-v4-flash,deepseek-v4-pro --split holdout --run
```

默认结果存入被忽略的 `cloud-evaluation/result.json`。每个候选在同一实现和固定题集上比较旧/新提示词，最多两次尝试，默认4路并发；不读取 config.json、Jev Key 或课程页面，不混入 Jev 成绩。报告原始正确率（含失败/未作答）、覆盖率、已答准确率、分题型、多选错选/漏选、耗时与 token；额度耗尽停止后续任务并保留未执行分母。评测结果不含完整题面。实网对照与限制见 [第一批验收记录](docs/audit/2026-10-23-workbuddy-quality-phase1.md)。

| 文件 | 作用 |
|---|---|
| wb-answer-service.mjs | Jev + 兼容 API 服务 |
| wb-answer-service.workbuddy.mjs | Jev + WorkBuddy 服务 |
| wb-service-core.mjs | 答案策略、校验、回环协议 |
| wb-cloud-quality.mjs / wb-answer-diagnostics.mjs | 云模型固定、专用指令、输入检查及脱敏诊断 |
| wb-runner.mjs / wb-runner-runtime.mjs | Edge、注入、健康会话、实例锁 |
| wb-launch.mjs / 启动学习通AI挂机.cmd / _find-node.cmd | Node 探测、启动与模式选择 |
| browser/course-engine.js | 独立编写的播放器、测验与导航源文件 |
| browser/exam-engine.js | 手动启动的单题答题适配、选项映射及跨页继续 |
| browser/video-quiz.mjs | 视频内弹题的识别、答题、提交和原视频恢复 |
| browser/status-panel.mjs | 常驻状态栏与答题模式切换 |
| browser/answer-diagnostics.mjs | 输入完整性检查与可关闭的选项核对 |
| scripts/build-browser.mjs | 生成或只读核对两个浏览器入口 |
| scripts/evaluate-workbuddy.mjs / scripts/cloud-evaluation.mjs | 仅云 SDK 的同题对照及计分 |
| deepseek-console/xuexitong-console.js | 生成的视频/答题统一驱动 |
| xuexitong_v3.user.js | 生成的独立 V3 播放器 |
| tests/ | 无真实凭据回归测试 |
| config.example.json / wb-public-config.example.json | 本地配置模板 |
| package-lock.json | 精确依赖锁 |

## 浏览器开发与边界

修改 browser/ 内源码后运行 `npm run build:browser`；`npm run check:browser` 只读验证生成物与源码一致。两个入口不分别手工修改。

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
