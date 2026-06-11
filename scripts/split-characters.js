const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || path.join(__dirname, '..', 'characters.csv');
const OUT = process.argv[3] || path.join(__dirname, '..', 'data', 'characters');
const PAGE_SIZE = 100;
const MAX_FILE_BYTES = 100 * 1024;
const MAX_FIELD_CHARS = 24000;
const MAX_POSTINGS = 1200;
const STOPWORDS = new Set(['the', 'and', 'of', 'a', 'an', 'to', 'in', 'is', 'it', 'on', 'for', 'with', 'you', 'your']);

function tokenize(text) {
  const tokens = new Set();
  const norm = (text || '').normalize('NFKD').toLowerCase().replace(/[̀-ͯ]/g, '');
  for (const t of norm.split(/[^a-z0-9]+/)) {
    if (t.length >= 2 && t.length <= 24 && !STOPWORDS.has(t)) tokens.add(t);
  }
  return tokens;
}

const HEADERS = [
  'id','name','description','personality','scenario','first_message','avatar',
  'creator_id','creator_name','creator_verified','is_nsfw','is_public',
  'is_force_removed','is_blocked','total_chat','total_message','created_at',
  'tags','stats_chat','stats_message',
];

function bool(v) {
  return v === 'true' || v === 'True' || v === '1' || v === 't';
}

function num(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseTags(v) {
  if (!v) return [];
  const t = v.trim();
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t.replace(/'/g, '"'));
      if (Array.isArray(arr)) return arr.map(String).map(s => s.trim()).filter(Boolean);
    } catch {}
  }
  return t.split(/[,;|]/).map(s => s.replace(/^[\s'"\[]+|[\s'"\]]+$/g, '')).filter(Boolean);
}

function clip(s, max = MAX_FIELD_CHARS) {
  if (typeof s !== 'string') return '';
  return s.length > max ? s.slice(0, max) : s;
}

function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'");
}

function snippet(s, max = 200) {
  const clean = stripHtml(s).replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

function shardDir(id) {
  const clean = id.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (clean.slice(0, 2) || '00').padEnd(2, '0');
}

const RESERVED_NAMES = new Set(['aux', 'con', 'nul', 'prn', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9']);

function shardFileName(prefix) {
  return RESERVED_NAMES.has(prefix) ? `${prefix}_.json` : `${prefix}.json`;
}

async function* csvRecords(file) {
  const stream = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let field = '';
  let record = [];
  let inQuotes = false;
  let prevQuote = false;
  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inQuotes) {
        if (c === '"') {
          if (prevQuote) { field += '"'; prevQuote = false; }
          else prevQuote = true;
        } else if (prevQuote) {
          inQuotes = false;
          prevQuote = false;
          if (c === ',') { record.push(field); field = ''; }
          else if (c === '\n') { record.push(field); field = ''; yield record; record = []; }
          else if (c !== '\r') field += c;
        } else {
          field += c;
        }
      } else {
        if (c === '"' && field === '') inQuotes = true;
        else if (c === ',') { record.push(field); field = ''; }
        else if (c === '\n') { record.push(field); field = ''; yield record; record = []; }
        else if (c !== '\r') field += c;
      }
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    yield record;
  }
}

async function main() {
  const t0 = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'list'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'char'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'search'), { recursive: true });

  const listing = [];
  const tokenIndex = new Map();
  const tagCounts = new Map();
  const madeDirs = new Set();
  let rows = 0;
  let kept = 0;
  let skipped = 0;
  let truncated = 0;
  let headerSeen = false;

  for await (const rec of csvRecords(SRC)) {
    if (!headerSeen) { headerSeen = true; continue; }
    rows++;
    if (rec.length < HEADERS.length - 3) { skipped++; continue; }
    const row = {};
    for (let i = 0; i < HEADERS.length; i++) row[HEADERS[i]] = rec[i] ?? '';

    const id = row.id.trim();
    if (!id || !row.name || !bool(row.is_public) || bool(row.is_force_removed) || bool(row.is_blocked)) {
      skipped++;
      continue;
    }

    const tags = parseTags(row.tags).slice(0, 20);
    const chats = Math.max(num(row.total_chat), num(row.stats_chat));
    const messages = Math.max(num(row.total_message), num(row.stats_message));

    const detail = {
      id,
      name: clip(row.name, 300),
      description: clip(row.description),
      personality: clip(row.personality),
      scenario: clip(row.scenario),
      first_message: clip(row.first_message),
      avatar: clip(row.avatar, 500),
      creator: clip(row.creator_name, 120),
      creator_verified: bool(row.creator_verified),
      nsfw: bool(row.is_nsfw),
      tags,
      chats,
      messages,
      created_at: clip(row.created_at, 40),
    };

    let json = JSON.stringify(detail);
    if (Buffer.byteLength(json) > MAX_FILE_BYTES) {
      const budget = Math.floor(MAX_FIELD_CHARS / 4);
      for (const f of ['description', 'personality', 'scenario', 'first_message']) {
        detail[f] = clip(detail[f], budget);
      }
      json = JSON.stringify(detail);
      truncated++;
    }

    const dir = shardDir(id);
    if (!madeDirs.has(dir)) {
      fs.mkdirSync(path.join(OUT, 'char', dir), { recursive: true });
      madeDirs.add(dir);
    }
    fs.writeFileSync(path.join(OUT, 'char', dir, `${id}.json`), json);

    listing.push({
      id,
      n: snippet(detail.name, 120),
      d: snippet(detail.description, 180),
      a: detail.avatar,
      t: tags.slice(0, 6),
      x: detail.nsfw ? 1 : 0,
      c: chats,
      m: messages,
    });
    for (const tag of tags) {
      const key = tag.toLowerCase();
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
    }
    const nsfwFlag = detail.nsfw ? 1 : 0;
    for (const token of tokenize(detail.name + ' ' + tags.join(' '))) {
      let postings = tokenIndex.get(token);
      if (!postings) { postings = []; tokenIndex.set(token, postings); }
      postings.push([id, chats, nsfwFlag]);
    }
    kept++;
    if (kept % 25000 === 0) console.log(`processed ${kept} characters...`);
  }

  listing.sort((a, b) => b.c - a.c || b.m - a.m);

  const pages = Math.ceil(listing.length / PAGE_SIZE);
  let oversizedPages = 0;
  for (let p = 0; p < pages; p++) {
    const slice = listing.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
    let json = JSON.stringify(slice);
    if (Buffer.byteLength(json) > MAX_FILE_BYTES) {
      slice.forEach(e => { e.d = snippet(e.d, 100); e.t = e.t.slice(0, 4); });
      json = JSON.stringify(slice);
      if (Buffer.byteLength(json) > MAX_FILE_BYTES) oversizedPages++;
    }
    fs.writeFileSync(path.join(OUT, 'list', `page-${p}.json`), json);
  }

  const shards = new Map();
  for (const [token, postings] of tokenIndex) {
    postings.sort((a, b) => b[1] - a[1]);
    if (postings.length > MAX_POSTINGS) postings.length = MAX_POSTINGS;
    const prefix = token.slice(0, 2);
    let shard = shards.get(prefix);
    if (!shard) { shard = {}; shards.set(prefix, shard); }
    shard[token] = postings;
  }

  let oversizedShards = 0;
  let shardFiles = 0;
  const splitMap = {};
  for (const [prefix, shard] of shards) {
    let json = JSON.stringify(shard);
    if (Buffer.byteLength(json) <= MAX_FILE_BYTES) {
      fs.writeFileSync(path.join(OUT, 'search', `${prefix}.json`), json);
      shardFiles++;
      continue;
    }
    const stub = {};
    const subs = new Map();
    for (const [token, postings] of Object.entries(shard)) {
      if (token.length === 2) {
        stub[token] = postings;
        continue;
      }
      const p3 = token.slice(0, 3);
      let sub = subs.get(p3);
      if (!sub) { sub = {}; subs.set(p3, sub); }
      sub[token] = postings;
    }
    splitMap[prefix] = [...subs.keys()].map(p => p[2]).sort().join('');
    fs.writeFileSync(path.join(OUT, 'search', `${prefix}.json`), JSON.stringify(stub));
    shardFiles++;
    for (const [p3, sub] of subs) {
      let subJson = JSON.stringify(sub);
      let cap = MAX_POSTINGS;
      while (Buffer.byteLength(subJson) > MAX_FILE_BYTES && cap > 50) {
        cap = Math.floor(cap / 2);
        for (const token of Object.keys(sub)) {
          if (sub[token].length > cap) sub[token] = sub[token].slice(0, cap);
        }
        subJson = JSON.stringify(sub);
      }
      if (Buffer.byteLength(subJson) > MAX_FILE_BYTES) oversizedShards++;
      fs.writeFileSync(path.join(OUT, 'search', `${p3}.json`), subJson);
      shardFiles++;
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([tag, count]) => ({ tag, count }));

  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({
    total: listing.length,
    pageSize: PAGE_SIZE,
    pages,
    generated: new Date().toISOString(),
    search: { shards: shards.size, tokens: tokenIndex.size, maxPostings: MAX_POSTINGS, split: splitMap },
    tags: topTags,
  }));

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`done in ${secs}s: ${rows} rows, ${kept} kept, ${skipped} skipped, ${truncated} truncated, ${pages} list pages, ${oversizedPages} pages >100KB, ${shardFiles} search shard files (${tokenIndex.size} tokens, ${Object.keys(splitMap).length} split), ${oversizedShards} shards >100KB`);
}

main().catch(err => { console.error(err); process.exit(1); });
