import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { installStatusPanel } from '../browser/status-panel.mjs';
const root = new URL('../', import.meta.url);
const engine = `${installStatusPanel.toString()}\n${await readFile(new URL('browser/course-engine.js', root), 'utf8')}`;
const consoleScript = `/* Generated from browser/course-engine.js by scripts/build-browser.mjs. */\n(() => {\n'use strict';\nconst LOCAL_TOKEN = '__LOCAL_TOKEN__';\n${engine}\ncreateCourseController('console', LOCAL_TOKEN);\n})();\n`;
const userscript = `// ==UserScript==\n// @name         学习通课程播放器 V3\n// @namespace    independent-course-controller\n// @version      4.0.0\n// @description  播放课程视频并等待当前章节测验完成\n// @match        https://chaoxing.com/mycourse/studentstudy*\n// @match        https://*.chaoxing.com/mycourse/studentstudy*\n// @match        https://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*\n// @grant        none\n// @run-at       document-idle\n// ==/UserScript==\n\n/* Generated from browser/course-engine.js by scripts/build-browser.mjs. */\n(() => {\n'use strict';\n${engine}\ncreateCourseController('v3', null);\n})();\n`;
const outputs = [['deepseek-console/xuexitong-console.js', consoleScript], ['xuexitong_v3.user.js', userscript]];
if (process.argv.includes('--check')) {
  for (const [path, expected] of outputs) {
    const actual = await readFile(new URL(path, root), 'utf8');
    if (actual !== expected) throw new Error(`Generated browser file is stale: ${path}`);
  }
  console.log('Generated browser scripts match original engine and builder.');
} else {
  await mkdir(new URL('deepseek-console/', root), { recursive: true });
  for (const [path, content] of outputs) await writeFile(new URL(path, root), content);
  console.log(`Built standalone scripts in ${fileURLToPath(root)}`);
}
