const { spawn } = require('node:child_process');
const path = require('node:path');

const { loadEnvFile } = require('./env');

const ROOT = path.resolve(__dirname, '../..');

/**
 * Runs a command after loading `.env.e2e` into the current environment.
 */
function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command) {
    console.error('Usage: node ./maestro/support/with-e2e-env.js <command> [...args]');
    process.exit(1);
  }

  loadEnvFile(path.join(ROOT, '.env.e2e'), { override: true });
  process.env.EXPO_NO_DOTENV = '1';
  process.env.EXPO_PUBLIC_E2E ??= '1';
  process.env.ROTINI_E2E_ENV = '1';
  process.env.ROTINI_E2E_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  process.env.ROTINI_E2E_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const child = spawn(command, args, {
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

main();
