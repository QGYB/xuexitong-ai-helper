// Playwright Edge runner: one isolated persistent profile per instance (1..99).
import {fileURLToPath} from 'node:url';
import {runRunner} from './wb-runner-runtime.mjs';

try {
    await runRunner({directory: fileURLToPath(new URL('.', import.meta.url))});
} catch (error) {
    console.error(`[Runner] ${error.message}`);
    process.exitCode = 1;
}
