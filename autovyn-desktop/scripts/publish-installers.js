'use strict';

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const downloadsDir = path.join(__dirname, '..', '..', 'autovyn-web', 'public', 'downloads');

const releaseTargets = [
  {
    platform: 'windows',
    outputName: 'Autovyn-Desktop-Setup.exe',
    matchers: [/^Autovyn-Desktop-Setup\.exe$/i, /^Autovyn[- ]Agent[- ].*\.exe$/i, /\.exe$/i]
  },
  {
    platform: 'macos',
    outputName: 'Autovyn-Desktop-arm64.dmg',
    matchers: [/^Autovyn-Desktop-arm64\.dmg$/i, /^Autovyn[- ]Desktop[- ].*arm64.*\.dmg$/i, /arm64.*\.dmg$/i]
  },
  {
    platform: 'macos',
    outputName: 'Autovyn-Desktop-x64.dmg',
    matchers: [/^Autovyn-Desktop-x64\.dmg$/i, /^Autovyn[- ]Desktop[- ].*x64.*\.dmg$/i, /x64.*\.dmg$/i]
  },
  {
    platform: 'macos',
    outputName: 'Autovyn-Desktop-universal.dmg',
    matchers: [/^Autovyn-Desktop-universal\.dmg$/i, /^Autovyn[- ]Desktop[- ].*universal.*\.dmg$/i, /universal.*\.dmg$/i]
  },
  {
    platform: 'macos',
    outputName: 'Autovyn-Desktop.dmg',
    matchers: [/^Autovyn-Desktop\.dmg$/i, /^Autovyn[- ]Agent.*\.dmg$/i]
  },
  {
    platform: 'linux',
    outputName: 'Autovyn-Desktop.deb',
    matchers: [/^Autovyn-Desktop\.deb$/i, /^Autovyn[- ]Agent.*\.deb$/i, /\.deb$/i]
  },
  {
    platform: 'linux',
    outputName: 'Autovyn-Desktop.AppImage',
    matchers: [/^Autovyn-Desktop\.AppImage$/i, /^Autovyn[- ]Agent.*\.AppImage$/i, /\.AppImage$/i]
  }
];

function listDistFiles() {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Build output folder not found: ${distDir}`);
  }

  return fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolutePath = path.join(distDir, entry.name);
      const stats = fs.statSync(absolutePath);
      return {
        name: entry.name,
        absolutePath,
        mtimeMs: stats.mtimeMs,
        mode: stats.mode
      };
    });
}

function selectSourceFile(files, matchers) {
  for (const matcher of matchers) {
    const matches = files
      .filter((file) => matcher.test(file.name))
      .sort((left, right) => right.mtimeMs - left.mtimeMs);

    if (matches.length) {
      return matches[0];
    }
  }

  return null;
}

function copyRelease(sourceFile, platform, outputName) {
  const platformDir = path.join(downloadsDir, platform);
  const destinationPath = path.join(platformDir, outputName);

  fs.mkdirSync(platformDir, { recursive: true });
  fs.copyFileSync(sourceFile.absolutePath, destinationPath);
  fs.chmodSync(destinationPath, sourceFile.mode);

  console.log(`Published ${sourceFile.name} -> ${path.relative(path.join(__dirname, '..', '..'), destinationPath)}`);
}

function main() {
  const distFiles = listDistFiles();
  let publishedCount = 0;

  releaseTargets.forEach((target) => {
    const sourceFile = selectSourceFile(distFiles, target.matchers);
    if (!sourceFile) {
      console.warn(`Skipped ${target.platform}/${target.outputName}: no matching build artifact found in dist/`);
      return;
    }

    copyRelease(sourceFile, target.platform, target.outputName);
    publishedCount += 1;
  });

  if (!publishedCount) {
    throw new Error('No installers were published. Build the desktop app first.');
  }
}

main();
