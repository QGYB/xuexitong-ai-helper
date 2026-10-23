# Edge Local Network Access 兼容性修复回执

结论：本次修复通过自动测试和 Edge 155 隔离复测，可发布。用户报告中的拦截属于浏览器本地网络权限层；继续增加服务端 CORS 头不足以解决权限被拒的问题。

## 实现

修改 `wb-runner-runtime.mjs`：仅在合法 HTTPS Chaoxing 顶层章节学习页或受支持的单题页请求脚本时，为这个精确 origin 授予 `loopback-network`。旧 LNA 浏览器遇到不支持该权限名称时，回退同来源的 `local-network-access`；不含 LNA 的旧浏览器保留原行为。

使用单一浏览器级 CDP 会话，贯穿本项目独立浏览器的整个生命周期。实测发现临时 CDP 会话 detach 会清除对应权限覆盖，所以不能授权后立即 detach。新标签、页面导航和原标签关闭均不应使这个浏览器级授权失效。

没有添加 `--disable-features=LocalNetworkAccessChecks`，没有全局授予任意网站权限，没有修改系统或 Edge 企业策略。没有使用 `context.grantPermissions(['local-network-access'])`：Edge 155 实测该调用还会改变相机等未列出的权限，并同时放开局域网权限；`Browser.setPermission` 可以只改变指定权限。

原有 Origin、Host、令牌和会话身份校验保留；外站、HTTP 来源、相似路径和子框架不会获得脚本或触发授权。授权前后均验证文档身份，导航到其他页面不会继续获取脚本。

## 验证命令与结果

| 实际执行的检查 | 输出摘要 |
|---|---|
| `node --test --test-name-pattern='loopback\|LNA\|permission policy' tests/runner.test.mjs`（修复前） | 新增6项测试全部失败，暴露授权缺失、旧版分支、策略错误及导航期间取凭据的问题 |
| `node --test tests/runner.test.mjs` | 单独 runner 测试通过；最终以全量复测结果为准 |
| `npm test`（Node 24.19.0） | 187/187，0失败 |
| `scripts/run-tests.mjs`（通过本地 Node 22.22.2 显式执行） | 187/187，0失败 |
| `node scripts/build-browser.mjs --check` | 生成脚本与源码、构建器一致 |
| `node scripts/check-local-network.mjs` | Edge 155.0.4283.62，临时档案，合成 HTTPS 页面与真实回环 HTTP 服务；完整矩阵通过 |
| `git diff --check` | 无空白错误；旧文件原 CRLF 规范化提示不影响测试 |

Edge 实测矩阵：

| 页面 | 已拒绝回环权限时 | runner 授权后 `/health` | `/answer` | 相机/局域网权限 |
|---|---|---:|---:|---|
| `https://mooc1.chaoxing.com/mycourse/studentstudy` | 浏览器请求失败，而 Node 健康检查200 | 200 | 200 | 未改变 |
| `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentstudy` | 同上 | 200 | 200 | 未改变 |
| `https://mooc1.chaoxing.com/exam-ans/exam/test/reVersionTestStartNew` | 同上 | 200 | 200 | 未改变 |

补充断言：跨来源子框架的脚本绑定被拒；外站未获回环权限；无效令牌仍返回403；关闭原标签后，新标签仍可完成授权和健康请求；浏览器关闭后删除临时档案。

## 复现范围与 OPEN

- 没有访问真实课程、提交试卷、登录账号或调用付费上游；没有读取或修改用户 Key、运行配置及实际浏览器档案。
- 真实浏览器测试使用“显式拒绝回环权限”构造稳定复现，不声称每台新安装浏览器默认都会拒绝。
- 用户报告中的 Edge 155.0.4283.45 未安装；同一155系列的155.0.4283.62已实测。原用户的设备、企业策略和真实 iframe 结构仍为 OPEN。
- 旧版权限名称回退、策略失败和不支持 LNA 的分支通过合成单元测试；旧 Edge 二进制未实测，属于 OPEN。
- 更新后需关闭并重新启动本项目浏览器实例。刷新仍由旧 runner 启动的浏览器不会加载新桥接逻辑。不要关闭其他无关 Node 或 Edge 进程。

## 依据

- [Chrome Local Network Access 说明](https://developer.chrome.com/blog/local-network-access)：LNA 使用浏览器权限门槛，取代此前仅以 PNA 预检为核心的方案。
- [DevTools Browser 协议](https://chromedevtools.github.io/devtools-protocol/tot/Browser/)：按来源设置单项权限；本次行为还由上述 Edge 实测核验。

WorkBuddy 云服务正确率优化另见 `docs/plans/2026-10-23-workbuddy-answer-quality.md`。本轮没有实施云模型或答题策略变更，不能把兼容性修复当作准确率提升。
