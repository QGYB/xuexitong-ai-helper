# AGPLv3 许可切换回执

结论：当前版本采用未经修改的 GNU Affero General Public License v3.0，SPDX 标识为 `AGPL-3.0-only`，不附加非商业用途限制或其他项目专属许可条件。

## 最终变更

`LICENSE` 保存GNU官方协议全文；`NOTICE` 包含项目版权、仅版本3的授权和标准无担保声明；README、第三方声明、中文许可说明和贡献须知与之保持一致。`package.json` 及 `package-lock.json` 只替换项目根许可字段，版本、依赖、完整性值和第三方许可均不变。

文档明确允许商业使用和收费分发，分发修改版及非源码形式时按AGPL提供对应源码；修改版通过网络与用户交互时，按第13条向这些用户显著提供免费获取该版本对应源码的机会。没有把“联网”概括成必须公开所有软件，也没有要求私下修改一律上传GitHub。

README原有用途与合规提醒明确是提示，不作为附加许可证限制。许可仅覆盖相关权利人有权授权的原创材料，第三方依赖、平台内容和商标保留各自条款。历史版本仍按各自随附许可处理，不重写Git历史或宣称撤销既有合法授权。

## 验证证据

| 实际命令/动作 | 输出摘要 |
|---|---|
| `git fetch origin main`、`git rev-parse HEAD origin/main` | 编辑前本地/远端均为 `24c9b7676a5e684126069692809db33cc1a2ae12`，工作区干净 |
| `git log --all --format='%an'` | 作者名去重为QGYB；来源记录不单独构成全部权属的法律证明 |
| 编辑前完整跟踪树/全部引用历史扫描及忽略探针 | 52个跟踪文件、16个提交、135个唯一历史blob；27/27忽略探针通过，发现项0 |
| 下载GNU官方 `https://www.gnu.org/licenses/agpl-3.0.txt` 并逐字节比对 | 34523字节、0至17共18节，正文及附录完整；SHA-256为 `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0` |
| 仓库外 `verify-license.mjs` | 官方全文字节一致；包元数据仅根许可字段变化；NOTICE与元数据均选仅版本3；4份文档19个相对链接有效；运行时改动0 |
| `npm test`（Node24） | 281/281通过，不表示真实课程或法律适用性已经验证 |
| `npm run check:browser` | 生成脚本与源码一致，无需重建 |
| 暂存后完整跟踪树/全部引用历史扫描、文件白名单及 `git diff --check HEAD` | 仅9个许可、文档、元数据文件；无密钥、登录档案、EXE或运行时变更 |

本轮未读写真实密钥、用户配置或浏览器档案，未重启或改变运行中的课程、服务和浏览器，未改GitHub可见性或发布npm包。

## 资料与边界

- [GNU官方纯文本](https://www.gnu.org/licenses/agpl-3.0.txt)
- [OSI批准的AGPLv3](https://opensource.org/license/agpl-3.0)
- [SPDX：AGPL-3.0-only](https://spdx.org/licenses/AGPL-3.0-only.html)

OPEN：具体衍生关系、源码提供范围、第三方依赖组合和争议处理仍需结合实际作品、使用方式及适用法律判断。权利人只授权其有权授权的部分，软件回归测试不证明法律结论。
