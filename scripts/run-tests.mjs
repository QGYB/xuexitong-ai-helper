// Node 22's isolated test stream can corrupt non-ASCII stdout (nodejs/node#65934).
// Keep every test enabled while avoiding that stream on the supported Node 22 line.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const args = ['--test'];
if (Number(process.versions.node.split('.')[0]) === 22) args.push('--experimental-test-isolation=none');
args.push(...process.argv.slice(2), 'tests/browser.test.mjs', 'tests/answer-only.test.mjs', 'tests/video-popup.test.mjs', 'tests/cloud-quality.test.mjs', 'tests/cloud-evaluation.test.mjs', 'tests/runner.test.mjs', 'tests/service.test.mjs', 'tests/providers.test.mjs', 'tests/windows-launcher.test.mjs');
const result = spawnSync(process.execPath, args, {cwd:fileURLToPath(new URL('../',import.meta.url)), stdio:'inherit', windowsHide:true});
if (result.error) console.error('Test process could not start:', result.error.message);
process.exitCode = result.status ?? 1;
