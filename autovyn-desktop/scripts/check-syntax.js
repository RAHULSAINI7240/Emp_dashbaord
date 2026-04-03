'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const files = [
  'src/main.js',
  'src/preload.js',
  'src/api-client.js',
  'src/session-store.js',
  'src/tracker-agent.js',
  'src/renderer.js'
];

files.forEach((relativeFile) => {
  const filePath = path.join(__dirname, '..', relativeFile);
  execFileSync(process.execPath, ['--check', filePath], {
    stdio: 'inherit'
  });
});

console.log('Syntax check passed.');
