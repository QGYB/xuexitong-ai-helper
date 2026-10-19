import {fileURLToPath} from 'node:url';
import {launchApplication} from './wb-runner-runtime.mjs';

try {
    await launchApplication({directory: fileURLToPath(new URL('.', import.meta.url))});
} catch (error) {
    console.error(`[Launcher] ${error.message}`);
    process.exitCode = 1;
}
