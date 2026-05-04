const fs = require('node:fs');

/**
 * Loads a dotenv-style file into the current process environment.
 *
 * @param {string} filePath Path to the dotenv file.
 * @param {{ override?: boolean }} [options] Loading options.
 */
function loadEnvFile(filePath, options = {}) {
  const { override = false } = options;

  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (override || !process.env[key]) process.env[key] = value;
  }
}

module.exports = {
  loadEnvFile,
};
