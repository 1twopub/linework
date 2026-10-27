// Builds feed.json from the repo's open post issues. Run by .github/workflows/pages.yml.
// A post is recognised by the <!-- linework-post --> marker the relay writes into every issue
// (GitHub drops labels when the token can only manage issues, so labels aren't relied on).
//
// Issues are the database: the relay files one per post, closing one removes it.
// Every post's match is recomputed here from the drawing itself, so a tampered issue
// can't pin a drawing to a record it wouldn't really get.
//
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo), optional FEED_AUTHOR (login allowed to post;
// defaults to the repo owner, which is who the relay's token belongs to), optional FEED_MAX (default 300).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../js/analyze.js';
import { matchRelease } from '../js/catalog.js';
import { decodeDrawing } from '../js/share.js';
import { parseNet } from '../js/sketchnet.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const author = (process.env.FEED_AUTHOR || repo?.split('/')[0] || '').toLowerCase();
const max = Number(process.env.FEED_MAX || 300);
const api = process.env.GITHUB_API_URL || 'https://api.github.com';

if (!repo) { console.error('GITHUB_REPOSITORY is not set'); process.exit(1); }

async function listIssues() {
  const out = [];
  for (let page = 1; out.length < max * 2 && page <= 10; page++) {
    const url = `${api}/repos/${repo}/issues?state=open&per_page=100&page=${page}&sort=created&direction=desc${author ? `&creator=${encodeURIComponent(author)}` : ''}`;
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'linework-feed', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    out.push(...batch.filter((i) => !i.pull_request && (i.body || '').includes('<!-- linework-post -->')));
    if (batch.length < 100) break;
  }
  return out;
}

function captionOf(body) {
  const m = body.match(/<!-- linework-caption:([A-Za-z0-9_-]*) -->/);
  if (!m) return '';
  try {
    return Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8').slice(0, 140);
  } catch { return ''; }
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
const bin = fs.readFileSync(path.join(root, 'models', 'sketchnet.bin'));
const net = parseNet(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length));
const issues = await listIssues();
const posts = [];
const skipped = [];

for (const issue of issues) {
  if (posts.length >= max) break;
  if (author && issue.user?.login?.toLowerCase() !== author) { skipped.push([issue.number, 'not filed by the relay']); continue; }
  const body = issue.body || '';
  const code = body.match(/LW1\.[A-Za-z0-9_-]+/)?.[0];
  if (!code) { skipped.push([issue.number, 'no drawing code']); continue; }
  try {
    const strokes = decodeDrawing(code);
    const a = analyze(strokes, { net });
    const r = matchRelease(a, catalog);
    if (!r) throw new Error('no match');
    posts.push({
      n: issue.number,
      at: issue.created_at,
      code,
      caption: captionOf(body),
      likes: Number(body.match(/<!-- linework-likes:(\d+) -->/)?.[1] || 0),
      motif: a.motif,
      motifLabel: a.motifLabel,
      traits: a.traits,
      release: { id: r.id, name: r.name, artists: r.artists, year: r.year, image: r.image, url: r.url },
    });
  } catch (err) {
    skipped.push([issue.number, err.message]);
  }
}

const feed = { updated: new Date().toISOString(), count: posts.length, posts };
fs.writeFileSync(path.join(root, 'feed.json'), JSON.stringify(feed));
console.log(`feed.json: ${posts.length} posts from ${issues.length} open issues`);
for (const [n, why] of skipped) console.log(`  skipped #${n}: ${why}`);
