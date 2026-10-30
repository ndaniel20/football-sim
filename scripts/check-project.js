const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoots = ['src', 'scripts', 'public/assets/js'];
const publicDirectory = path.join(projectRoot, 'public');
const javascriptFiles = [];
const missingAssets = [];

function collectJavaScript(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScript(entryPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) javascriptFiles.push(entryPath);
  }
}

for (const sourceRoot of sourceRoots) collectJavaScript(path.join(projectRoot, sourceRoot));

for (const filePath of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exitCode = 1;
  }
}

for (const filename of fs.readdirSync(publicDirectory).filter((entry) => entry.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(publicDirectory, filename), 'utf8');
  for (const [, assetPath] of html.matchAll(/(?:src|href)="(\/(?:assets|images)\/[^"?#]+)"/g)) {
    const resolvedPath = path.resolve(publicDirectory, assetPath.slice(1));
    if (!resolvedPath.startsWith(`${publicDirectory}${path.sep}`) || !fs.existsSync(resolvedPath)) {
      missingAssets.push(`${filename}: ${assetPath}`);
    }
  }
}

if (missingAssets.length) {
  console.error(`Missing local assets:\n${missingAssets.join('\n')}`);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Checked ${javascriptFiles.length} JavaScript files and local assets in public HTML pages.`);
