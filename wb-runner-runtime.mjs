// Shared runner/launcher boundaries. Script payloads stay in memory and are fetched per document.
import {openSync, closeSync, readFileSync, writeFileSync, unlinkSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {installStatusPanel} from './browser/status-panel.mjs';

const BASE = 'http://127.0.0.1:37841';
const SERVICE = 'xuexitong-ai-helper';

export function checkNodeVersion(version = process.versions.node) {
    const [major, minor] = version.split('.').map(Number);
    if (!(major > 22 || (major === 22 && minor >= 12))) throw new Error('Node.js >=22.12.0 is required on PATH.');
}

export function parseOptions(args) {
    let instance = 1, mode, hasInstance = false;
    for (const arg of args) {
        if (arg === '--openai' || arg === '--workbuddy') {
            if (mode) throw new Error('Choose only one mode: --openai or --workbuddy.');
            mode = arg.slice(2);
        } else if (hasInstance) {
            throw new Error('Unexpected argument. Usage: [1..99] [--openai|--workbuddy]');
        } else {
            if (!/^[1-9][0-9]?$/.test(arg)) throw new Error('Instance must be a canonical integer from 1 to 99.');
            instance = Number(arg); hasInstance = true;
        }
    }
    return {instance, mode};
}

export function selectMode(directory, explicit) {
    if (explicit === 'openai' || explicit === 'workbuddy') return explicit;
    const a = existsSync(join(directory, 'config.json'));
    const b = existsSync(join(directory, 'wb-public-config.json'));
    if (a === b) throw new Error('Mode is ambiguous: choose --openai or --workbuddy, or provide exactly one config file.');
    return a ? 'openai' : 'workbuddy';
}

class Unavailable extends Error {}
async function requestJSON(path, {fetchImpl = fetch, requestTimeoutMs = 3000, signal} = {}) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    let timer, abort;
    try {
        return await Promise.race([
            (async () => {
                let response;
                try { response = await fetchImpl(`${BASE}${path}`, {signal: controller.signal, redirect: 'error', cache: 'no-store'}); }
                catch (error) { throw new Unavailable('Local service is unavailable.', {cause: error}); }
                if (response.status !== 200) throw new Error(`Local service ${path} health/protocol check failed (HTTP ${response.status}).`);
                try { return await response.json(); }
                catch { throw new Error('Local service returned invalid JSON identity.'); }
            })(),
            new Promise((_, reject) => {
                abort = () => { controller.abort(signal.reason); reject(signal.reason || new Error('Service readiness cancelled.')); };
                signal?.addEventListener('abort', abort, {once: true});
                timer = setTimeout(() => { controller.abort(); reject(new Unavailable('Local service request timeout.')); }, requestTimeoutMs);
            }),
        ]);
    } finally { clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
}

export async function probeService(options = {}) {
    let data;
    try { data = await requestJSON('/health', options); }
    catch (error) { if (error instanceof Unavailable) return null; throw error; }
    if (!data || data.ok !== true || data.service !== SERVICE || data.protocol !== 1 ||
        typeof data.sessionId !== 'string' || !data.sessionId.trim() ||
        !['openai', 'workbuddy'].includes(data.mode)) throw new Error('Local service health identity or protocol mismatch.');
    if (options.mode && data.mode !== options.mode) throw new Error(`Local service mode mismatch: requested ${options.mode}, found ${data.mode}.`);
    return data;
}

export async function waitForService(options = {}) {
    const deadline = Date.now() + (options.timeoutMs ?? 30000);
    do {
        options.signal?.throwIfAborted();
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const data = await probeService({...options, requestTimeoutMs: Math.min(options.requestTimeoutMs ?? 3000, remaining)});
        if (data) return data;
        const pause = Math.min(options.pollMs ?? 500, Math.max(0, deadline - Date.now()));
        if (pause) await delay(pause, undefined, {signal: options.signal});
    } while (Date.now() < deadline);
    throw new Error('Local answer service not ready before timeout.');
}

export async function getScripts(options = {}) {
    const health = await probeService(options);
    if (!health) throw new Error('Local service unavailable or health timeout. Refresh after restarting it.');
    const data = await requestJSON('/script', options);
    if (!data || data.service !== SERVICE || data.protocol !== 1 || data.sessionId !== health.sessionId)
        throw new Error('Local service script session identity mismatch. Refresh to retry.');
    if (typeof data.consoleScript !== 'string' || !data.consoleScript.trim() || typeof data.v3Script !== 'string')
        throw new Error('Local service returned invalid script payload.');
    return data;
}

function trustedSource(source) {
    try {
        if (!source.frame || !source.page || source.frame !== source.page.mainFrame()) return false;
        const url = new URL(source.frame.url());
        return url.protocol === 'https:' && /(^|\.)chaoxing\.com$/i.test(url.hostname) && /^\/(?:(?:mooc2-ans\/)?mycourse\/studentstudy|exam-ans\/exam\/test\/reVersionTestStartNew)\/?$/.test(url.pathname);
    } catch { return false; }
}

async function allowLocalLoopback(context, session, origin) {
    // The runner owns a persistent (default) context. Set only this permission;
    // grantPermissions would also deny unrelated permissions such as camera.
    const unsupported = error => /unknown permission|invalid permissiondescriptor name|unrecognized permission|unsupported permission/i.test(error?.message || '');
    const grant = name => session.send('Browser.setPermission', {permission:{name}, setting:'granted', origin});
    try { await grant('loopback-network'); }
    catch (error) {
        if (!unsupported(error)) throw error;
        try { await grant('local-network-access'); }
        catch (legacyError) {
            const major = Number.parseInt(context.browser()?.version(), 10);
            if (!(unsupported(legacyError) && major > 0 && major < 138)) throw legacyError;
            // Browsers predating LNA have neither descriptor and need no grant.
        }
    }
}

export async function installBridge(context, options = {}) {
    // Chromium clears permission overrides when their CDP session detaches.
    // Keep one browser-level session until this runner's dedicated browser closes;
    // it also survives page closure, navigation and popup replacement.
    let permissionSession;
    await context.exposeBinding('__WBGetScripts', async source => {
        if (!trustedSource(source)) throw new Error('Script access requires a trusted top-level Chaoxing study page.');
        const documentUrl = source.frame.url();
        permissionSession ||= context.browser().newBrowserCDPSession();
        await allowLocalLoopback(context, await permissionSession, new URL(documentUrl).origin);
        if (!trustedSource(source) || source.frame.url() !== documentUrl) throw new Error('Frame changed before trusted script delivery.');
        const data = await getScripts(options);
        if (!trustedSource(source) || source.frame.url() !== documentUrl) throw new Error('Frame changed before trusted script delivery.');
        return data;
    });
}

// This function is serialized into every document. It contains no script source or local token.
function bootstrap({v3Enabled}) {
    const trusted = () => window === window.top && location.protocol === 'https:' &&
        /(^|\.)chaoxing\.com$/i.test(location.hostname) && /^\/(?:(?:mooc2-ans\/)?mycourse\/studentstudy|exam-ans\/exam\/test\/reVersionTestStartNew)\/?$/.test(location.pathname);
    if (!trusted()) return;
    const doc = window.document, url = location.href, previous = window.__WB_BOOT_STATE;
    if (previous?.document === doc && !previous.closed) return;
    previous?.cancel?.();
    const controller = () => {
        const own = window.__xuexitongConsoleDeepSeek;
        return own && own === window.app && typeof own.inspectQuiz === 'function' && typeof own.stop === 'function';
    };
    if (!previous && controller()) { window.__WB_BOOTED = true; return; }
    const state = {document:doc, closed:false, phase:'waiting', attempts:0, timer:null};
    window.__WB_BOOT_STATE = state;
    window.__WB_BOOTED = false;
    const panel = window.__WBStatusPanel;
    const active = () => !state.closed && window.__WB_BOOT_STATE === state && window.document === doc && location.href === url && trusted();
    const startup = () => {};
    const bindStartup = () => panel.bind(startup, {
        mode:/^\/exam-ans\//.test(location.pathname) ? 'exam' : 'course',
        onRestart:() => { if (active() && state.phase === 'failed') { state.attempts = 0; void boot(); } },
        canRestart:() => active() && state.phase === 'failed'
    });
    const failed = message => {
        if (!active()) return;
        state.phase = 'failed'; bindStartup(); panel.update(startup, message, true);
        console.error('[学习通注入] 启动未完成，可通过右下角重新启动按钮重试。');
    };
    state.cancel = () => {
        state.closed = true; clearTimeout(state.timer); state.timer = null; panel.release(startup);
    };
    window.addEventListener('pagehide', state.cancel, {once:true});
    bindStartup(); panel.update(startup, '正在连接本地服务，加载学习助手', true);
    async function boot() {
        if (!active() || state.phase === 'loading' || state.phase === 'ready') return;
        state.phase = 'loading'; state.attempts++;
        panel.update(startup, '正在连接本地服务，加载学习助手', true);
        let payload;
        try {
            payload = await window.__WBGetScripts();
        } catch {
            if (!active()) return;
            if (state.attempts < 4) {
                state.phase = 'waiting';
                panel.update(startup, `连接未成功，正在自动重连（${state.attempts}/3）`, true);
                state.timer = setTimeout(() => { state.timer = null; void boot(); }, 1000);
            } else failed('无法加载学习助手；服务恢复后点击“重新启动”重试');
            return;
        }
        if (!active()) return;
        try {
            if (typeof payload?.consoleScript !== 'string' || !payload.consoleScript.trim()) throw new Error('Missing script');
            window.__WB_DRIVER = 'console';
            if (v3Enabled && payload.v3Script) {
                try { (new Function(payload.v3Script))(); }
                catch { console.error('[学习通注入] 可选播放器脚本未能启动。'); }
            }
            // Both independently authored controllers use native DOM APIs, without jQuery.
            (new Function(payload.consoleScript))();
            if (!controller()) throw new Error('Controller did not start');
            state.phase = 'ready'; window.__WB_BOOTED = true;
        } catch { failed('学习助手启动失败；点击“重新启动”重试，详情见控制台'); }
    }
    if (document.readyState === 'complete') void boot();
    else window.addEventListener('load', () => { void boot(); }, {once: true});
}
export function createBootstrap({v3Enabled = false} = {}) {
    return `(${installStatusPanel.toString()})();\n(${bootstrap.toString()})(${JSON.stringify({v3Enabled: Boolean(v3Enabled)})});`;
}

export function acquireInstance(directory, instance, pid = process.pid) {
    if (!Number.isInteger(instance) || instance < 1 || instance > 99) throw new Error('Instance must be an integer from 1 to 99.');
    const base = resolve(directory);
    const pidFile = join(base, `runner-${instance}.pid`);
    const owner = randomUUID();
    let fd;
    try { fd = openSync(pidFile, 'wx', 0o600); }
    catch (error) {
        if (error.code === 'EEXIST') throw new Error(`Instance ${instance} is already owned or has a stale lock (${pidFile}). Verify that its previous runner stopped before removing that PID file.`);
        throw error;
    }
    try { writeFileSync(fd, JSON.stringify({pid, owner})); }
    catch (error) { closeSync(fd); try { unlinkSync(pidFile); } catch {} throw error; }
    closeSync(fd);
    let released = false;
    return {
        profileDir: join(base, instance === 1 ? 'edge-profile' : `edge-profile-${instance}`),
        release() {
            if (released) return;
            released = true;
            try {
                const current = JSON.parse(readFileSync(pidFile, 'utf8'));
                if (current.pid === pid && current.owner === owner) unlinkSync(pidFile);
            } catch {}
        },
    };
}

export function manageContext(context, lock, proc = process) {
    return new Promise(resolve => {
        let closed = false, closing = false;
        const finish = () => {
            if (closed) return;
            closed = true; lock.release();
            proc.removeListener('SIGINT', stop); proc.removeListener('SIGTERM', stop); proc.removeListener('exit', exit);
            context.removeListener('close', finish);
            resolve();
        };
        const exit = () => lock.release();
        const stop = () => {
            if (closing || closed) return;
            closing = true;
            Promise.resolve().then(() => context.close()).finally(finish).catch(() => {});
        };
        context.once('close', finish);
        proc.on('SIGINT', stop); proc.on('SIGTERM', stop); proc.on('exit', exit);
    });
}

function childExit(child) {
    const state = {exited: false};
    state.done = new Promise((resolve, reject) => {
        child.once('error', error => { state.exited = true; reject(error); });
        child.once('exit', (code, signal) => { state.exited = true; resolve({code, signal}); });
    });
    state.done.catch(() => {});
    return state;
}

async function finishesWithin(done, timeoutMs) {
    let timer;
    try {
        return await Promise.race([done.then(() => true, () => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
    } finally { clearTimeout(timer); }
}

async function stopRunner(child, state, timeoutMs) {
    if (!child || state.exited) return;
    // Windows child.kill('SIGINT'/'SIGTERM') is forceful. IPC lets the child close Edge and release its lock first.
    if (child.connected && child.send) {
        try { child.send({type: 'wb:stop'}, () => {}); } catch {}
    }
    if (await finishesWithin(state.done, timeoutMs)) return;
    if (!state.exited) child.kill('SIGKILL');
    if (!await finishesWithin(state.done, 2000)) throw new Error('Runner did not exit after forced shutdown. Verify its process and profile lock.');
}

export async function launchApplication({directory, args = process.argv.slice(2), fetchImpl = fetch,
    spawnImpl = spawn, proc = process, timeoutMs = 30000, stopTimeoutMs = 8000} = {}) {
    checkNodeVersion();
    const options = parseOptions(args);
    const mode = selectMode(directory, options.mode);
    let ownedService, runner, serviceState, runnerState, stopping, serviceFailure, serviceReady = false;
    const startup = new AbortController();
    const stopChildren = () => {
        startup.abort(new Error('Launcher interrupted.'));
        if (runner && !stopping) {
            stopping = stopRunner(runner, runnerState, stopTimeoutMs);
            stopping.catch(() => {});
        }
        if (!serviceReady && ownedService && !serviceState.exited) ownedService.kill();
    };
    proc.on('SIGINT', stopChildren); proc.on('SIGTERM', stopChildren);
    try {
        const health = await probeService({mode, fetchImpl, signal: startup.signal});
        startup.signal.throwIfAborted();
        if (!health) {
            const filename = mode === 'workbuddy' ? 'wb-answer-service.workbuddy.mjs' : 'wb-answer-service.mjs';
            ownedService = spawnImpl(process.execPath, [join(directory, filename)], {cwd: directory, stdio: 'ignore', shell: false, windowsHide: true, detached: true});
            serviceState = childExit(ownedService);
            serviceFailure = serviceState.done.then(() => { throw new Error('Answer service exited before readiness.'); });
            // Keep the rejection observed during startup and browser lifetime.
            serviceFailure.catch(() => {});
            await Promise.race([waitForService({mode, fetchImpl, timeoutMs, signal: startup.signal}), serviceFailure]);
            // A ready service is shared by every launcher instance. Browser closure must not stop it.
            serviceReady = true;
            ownedService.unref();
            console.log(`[Launcher] Shared ${mode} service PID ${ownedService.pid}; it remains running after browser closure. Stop this verified service process after closing all instances.`);
        }
        startup.signal.throwIfAborted();
        runner = spawnImpl(process.execPath, [join(directory, 'wb-runner.mjs'), String(options.instance), `--${mode}`],
            {cwd: directory, stdio: ['inherit', 'inherit', 'inherit', 'ipc'], shell: false, windowsHide: true});
        runnerState = childExit(runner);
        const outcome = await runnerState.done;
        if (outcome.code !== 0) throw new Error(`Runner exited (${outcome.signal || outcome.code}).`);
    } finally {
        startup.abort(new Error('Service readiness cancelled.'));
        try {
            if (runner) await (stopping || stopRunner(runner, runnerState, stopTimeoutMs));
        } finally {
            if (!serviceReady && ownedService && !serviceState.exited) ownedService.kill();
            proc.removeListener('SIGINT', stopChildren); proc.removeListener('SIGTERM', stopChildren);
        }
    }
}

export async function runRunner({directory, args = process.argv.slice(2), proc = process, fetchImpl = fetch,
    loadChromium = async () => (await import('playwright')).chromium, closeTimeoutMs = 5000} = {}) {
    checkNodeVersion();
    const options = parseOptions(args), mode = selectMode(directory, options.mode);
    const controller = new AbortController();
    let lock, context, closing, closed, browserClosed = false, launching = false, markClosed;
    let resolveStopped;
    const stopped = new Promise(resolve => { resolveStopped = resolve; });
    controller.signal.addEventListener('abort', resolveStopped, {once: true});
    const closeContext = () => {
        if (!context || browserClosed) return;
        if (!closing) closing = (async () => {
            let timer;
            try {
                await Promise.race([
                    closed,
                    Promise.resolve().then(() => context.close()).then(() => { browserClosed = true; }),
                    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Browser close timeout.')), closeTimeoutMs); }),
                ]);
            } catch (error) {
                if (!browserClosed) throw new Error(`Browser shutdown unconfirmed; runner-${options.instance}.pid lock retained. Verify Edge has stopped before removing it.`, {cause: error});
            } finally { clearTimeout(timer); }
        })();
        closing?.catch(() => {});
        return closing;
    };
    const stop = () => { controller.abort(new Error('Runner stopped.')); closeContext(); };
    const message = value => { if (value?.type === 'wb:stop') stop(); };
    const exit = () => { if ((!context && !launching) || browserClosed) lock?.release(); };
    // Register before acquiring ownership or entering any asynchronous startup stage.
    proc.on('SIGINT', stop); proc.on('SIGTERM', stop); proc.on('message', message);
    proc.on('disconnect', stop); proc.on('exit', exit);
    try {
        lock = acquireInstance(directory, options.instance);
        await waitForService({mode, fetchImpl, signal: controller.signal});
        const chromium = await loadChromium();
        controller.signal.throwIfAborted();
        launching = true;
        try {
            context = await chromium.launchPersistentContext(lock.profileDir, {
                channel: 'msedge', headless: false, viewport: null,
                args: ['--start-maximized', '--no-first-run', '--no-default-browser-check'],
            });
        } finally { launching = false; }
        closed = new Promise(resolve => {
            markClosed = () => { browserClosed = true; resolve(); };
            context.once('close', markClosed);
        });
        // A stop during launch cannot cancel Playwright's promise; close the returned context before releasing ownership.
        controller.signal.throwIfAborted();
        await installBridge(context, {mode, fetchImpl, signal: controller.signal});
        controller.signal.throwIfAborted();
        await context.addInitScript(createBootstrap({v3Enabled: process.env.V3_ENABLED === '1'}));
        controller.signal.throwIfAborted();
        const page = context.pages()[0] || await context.newPage();
        await page.goto('https://i.chaoxing.com/', {waitUntil: 'domcontentloaded', timeout: 30000});
        console.log(`[Runner] Instance ${options.instance}; mode ${mode}; profile ${lock.profileDir}`);
        console.log('请在学习通 App 扫码登录并打开课程页。关闭浏览器即可退出；服务重启后刷新课程页。');
        await Promise.race([closed, stopped]);
    } catch (error) {
        if (!controller.signal.aborted) throw error;
    } finally {
        try { await closeContext(); }
        finally {
            if (!context || browserClosed) lock?.release();
            if (markClosed) context.removeListener('close', markClosed);
            controller.signal.removeEventListener('abort', resolveStopped);
            proc.removeListener('SIGINT', stop); proc.removeListener('SIGTERM', stop); proc.removeListener('message', message);
            proc.removeListener('disconnect', stop); proc.removeListener('exit', exit);
            if (proc.connected && proc.disconnect) proc.disconnect();
        }
    }
}
