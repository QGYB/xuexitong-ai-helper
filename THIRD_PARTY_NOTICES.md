# 第三方依赖与浏览器实现来源

## 当前浏览器实现

`browser/course-engine.js` 为本项目按行为规格独立编写的课程控制器；`scripts/build-browser.mjs` 将其生成两个自包含入口：

- `deepseek-console/xuexitong-console.js`：课程播放、章节练习识别、本地服务答题、提交与安全导航。
- `xuexitong_v3.user.js`：可单独安装的播放器及测验等待入口。

两份入口共享同一原创源文件，并非分别修改旧脚本。实现工作在不含旧源码的独立目录开展；实现者仅接收行为要求、本地服务协议和平台 DOM 标识事实，未读取旧浏览器源码、旧浏览器测试或上游 Git 历史。新测试采用独立合成 DOM 与真实 Edge 模拟页面。

## 替换记录

本地早期候选曾包含与 `chaolucky18/xuexitongScript` 高度重合的脚本，其公开再分发许可未明确。本次未以署名、非商业说明或改名代替授权，而是移除旧实现，独立重写。公开发行树及其 Git 历史均重新建立，不包含旧脚本、旧历史或旧令牌。

新实现完成后另行比对来源与文本重合，并进行代码复审。共有的标准浏览器 API、平台 DOM 标识、协议字段和兼容入口名属于接口需求；相似度扫描是审计证据之一，不单独构成版权或法律证明。不据此认定旧候选中各贡献者的身份或权利。

## npm 与运行时依赖

`@tencent-ai/workbuddy-cloud-sdk`、`playwright`、`undici` 由 npm 按 package-lock.json 安装，适用各包自带的许可证。浏览器脚本使用原生 DOM，不在运行时下载 jQuery、上游脚本或第三方脚本。依赖源码和浏览器会话不进入本仓库。

`ocsjs/ocsjs` 仅为早期文档致谢对象，未随本项目分发，其许可不用于本项目浏览器实现。

项目作者有权授权的原创部分适用 [LICENSE](LICENSE) 中未经修改的 GNU Affero General Public License v3.0（`AGPL-3.0-only`），版权与授权声明见 [NOTICE](NOTICE)。没有项目专属的非商业条款或额外许可条件。第三方依赖、平台内容和商标不被重新授权，中文说明见 [LICENSE-FAQ.md](LICENSE-FAQ.md)。
