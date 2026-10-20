import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));
const windows = {skip: process.platform !== 'win32'};
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'wb-launcher 中文 !& '));
  assert.equal(dirname(resolve(root)).toLowerCase(), resolve(tmpdir()).toLowerCase());
  assert.ok(basename(root).startsWith('wb-launcher 中文 !& '));
  t.after(() => rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}));
  for (const filename of ['启动学习通AI挂机.cmd', '_find-node.cmd']) {
    if (existsSync(join(repository, filename))) copyFileSync(join(repository, filename), join(root, filename));
  }
  const env = {...process.env};
  const reset = new Set(['PATH', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA', 'USERPROFILE', 'NODE_EXE', 'NODE_OPTIONS']);
  for (const key of Object.keys(env)) if (reset.has(key.toUpperCase())) delete env[key];
  const system32 = join(process.env.SystemRoot, 'System32');
  Object.assign(env, {PATH: system32, ProgramFiles: join(root, 'program files'), 'ProgramFiles(x86)': join(root, 'program files x86'), LOCALAPPDATA: join(root, 'local data'), USERPROFILE: join(root, '用户 ! & 100%keep%')});
  const versions = {};
  const preload = join(root, 'fixture-versions.cjs');
  const saveVersions = () => writeFileSync(preload, `const versions=${JSON.stringify(versions)};const v=versions[process.execPath.toLowerCase()];if(v){Object.defineProperty(process.versions,'node',{value:v});Object.defineProperty(process,'version',{value:'v'+v});}`);
  saveVersions();
  env.NODE_OPTIONS = `--require "${preload.replaceAll('\\', '/')}"`;
  function node(directory, version) {
    mkdirSync(directory, {recursive: true});
    const filename = join(directory, 'node.exe');
    copyFileSync(process.execPath, filename);
    if (version) versions[filename.toLowerCase()] = version;
    saveVersions();
    return filename;
  }
  function run(filename, args = '') {
    // cmd.exe reconstructs ProgramFiles on startup; set fixture roots inside it.
    const roots = [['ProgramFiles', 'PROGRAMFILES'], ['ProgramFiles(x86)', 'PROGRAMFILES_X86'], ['LOCALAPPDATA', 'LOCALAPPDATA'], ['USERPROFILE', 'USERPROFILE']];
    const lines = ['@echo off', 'setlocal DisableDelayedExpansion', 'chcp 65001 >nul'];
    for (const [variable, key] of roots) { env['WB_FIXTURE_' + key] = env[variable]; lines.push(`set "${variable}=%WB_FIXTURE_${key}%"`); }
    lines.push(`call ${filename}${args ? ' ' + args : ''}`, 'exit /b %errorlevel%');
    writeFileSync(join(root, 'fixture-entry.cmd'), lines.join('\r\n') + '\r\n');
    const result = spawnSync(join(system32, 'cmd.exe'), ['/d', '/s', '/c', 'fixture-entry.cmd'], {cwd: root, env, encoding: 'utf8', input: '\r\n', timeout: 15000, windowsHide: true});
    assert.ifError(result.error);
    return result;
  }
  function probe() {
    writeFileSync(join(root, 'probe.cmd'), '@echo off\r\nsetlocal DisableDelayedExpansion\r\ncall _find-node.cmd\r\nif errorlevel 1 exit /b 1\r\n"%NODE_EXE%" -e "process.stdout.write(JSON.stringify({exe:process.execPath,version:process.versions.node}))"\r\nexit /b %errorlevel%\r\n');
    return run('probe.cmd');
  }
  writeFileSync(join(root, 'wb-launch.mjs'), "console.log('LAUNCH_RESULT:'+JSON.stringify({exe:process.execPath,args:process.argv.slice(2),cwd:process.cwd()}));if(process.env.FIXTURE_LAUNCH_EXIT){console.error('fixture startup failure');process.exit(Number(process.env.FIXTURE_LAUNCH_EXIT));}\n");
  return {root, env, system32, node, run, probe};
}
function selected(result, expected) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).exe.toLowerCase(), expected.toLowerCase());
}

test('double-click entry finds private Node without PATH and preserves arguments and metacharacter paths', windows, t => {
  const h = fixture(t);
  const executable = h.node(join(h.env.USERPROFILE, '.workbuddy', 'binaries', 'node', 'versions', '22.22.2-6'), '22.22.2');
  const result = h.run('启动学习通AI挂机.cmd', '2 --workbuddy');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const marker = result.stdout.split(/\r?\n/).find(line => line.startsWith('LAUNCH_RESULT:'));
  assert.ok(marker, result.stdout);
  const proof = JSON.parse(marker.slice('LAUNCH_RESULT:'.length));
  assert.equal(proof.exe.toLowerCase(), executable.toLowerCase());
  assert.equal(proof.cwd.toLowerCase(), h.root.toLowerCase());
  assert.deepEqual(proof.args, ['2', '--workbuddy']);
});

test('a supported PATH Node takes precedence over fallback installations', windows, t => {
  const h = fixture(t), preferred = h.node(join(h.root, 'path node'), '24.0.0');
  h.node(join(h.env.ProgramFiles, 'nodejs'), '22.22.2');
  h.env.PATH = dirname(preferred) + ';' + h.system32;
  selected(h.probe(), preferred);
});

test('outdated PATH and standard Node versions are skipped for a compatible fallback', windows, t => {
  const h = fixture(t), old = h.node(join(h.root, 'old path node'), '20.19.0');
  h.env.PATH = dirname(old) + ';' + h.system32;
  h.node(join(h.env.ProgramFiles, 'nodejs'), '22.11.0');
  const current = h.node(join(h.env.USERPROFILE, '.workbuddy', 'binaries', 'node', 'versions', '22.12.0-1'), '22.12.0');
  selected(h.probe(), current);
});

for (const [label, variable, suffix] of [['official x64', 'ProgramFiles', ['nodejs']], ['official x86', 'ProgramFiles(x86)', ['nodejs']], ['per-user', 'LOCALAPPDATA', ['Programs', 'nodejs']]]) {
  test(`Node can be found in the ${label} installation directory without PATH`, windows, t => {
    const h = fixture(t), expected = h.node(join(h.env[variable], ...suffix), '22.12.0');
    selected(h.probe(), expected);
  });
}

test('invalid and incompatible private versions do not hide a compatible private Node', windows, t => {
  const h = fixture(t);
  const privateRoot = join(h.env.USERPROFILE, '.workbuddy', 'binaries', 'node', 'versions');
  h.node(join(privateRoot, '20.99.0'), '20.99.0');
  h.node(join(privateRoot, '22.13.0-invalid'), 'invalid-version');
  const current = h.node(join(privateRoot, '22.22.2-6'), '22.22.2');
  selected(h.probe(), current);
});

test('missing compatible Node produces a visible failure and never starts the launcher', windows, t => {
  const h = fixture(t);
  h.node(join(h.env.ProgramFiles, 'nodejs'), '22.11.0');
  const result = h.run('启动学习通AI挂机.cmd');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /22\.12\.0/);
  assert.ok(!result.stdout.includes('LAUNCH_RESULT:'));
  assert.equal(result.stderr, '');
});

test('startup failure keeps diagnostic output and propagates the original failure exit code', windows, t => {
  const h = fixture(t);
  h.node(join(h.env.ProgramFiles, 'nodejs'), '22.22.2');
  h.env.FIXTURE_LAUNCH_EXIT = '17';
  const result = h.run('启动学习通AI挂机.cmd', '--openai');
  assert.equal(result.status, 17, result.stdout + result.stderr);
  assert.match(result.stderr, /fixture startup failure/);
});
