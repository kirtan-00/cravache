// Regenerates js/embed-data.js — the offline snapshot that lets the game run
// from a file:// double-click (fetch of JSON is blocked there).
// Run after ANY edit to content/*.json or art/manifest.json:
//   node tools/embed.js
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const out = {
  clients: read('content/clients.json'),
  briefs: read('content/briefs.json'),
  staff: read('content/staff.json'),
  events: read('content/events.json'),
  manifest: read('art/manifest.json')
};

const banner = '// CravAche — embedded content snapshot so file:// double-click works without a\n' +
  '// server (fetch is blocked there). GENERATED from content/*.json + art/manifest.json:\n' +
  '//   node tools/embed.js\n' +
  '// Do not hand-edit. data.js prefers live JSON; this is the offline fallback.\n';

fs.writeFileSync(path.join(root, 'js/embed-data.js'),
  banner + 'window.G = window.G || {};\nG.EMBED = ' + JSON.stringify(out) + ';\n');
console.log('wrote js/embed-data.js');
