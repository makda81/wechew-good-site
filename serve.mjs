#!/usr/bin/env node
/**
 * Local static server with YouTube feed proxy (same paths as Vercel/Netlify).
 * Usage: node serve.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const CHANNEL_ID = 'UCJD-UtyBgYWqvmp_lknn7Lg';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
};

function parseTitle(raw) {
  const parts = String(raw || '')
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  while (
    parts.length &&
    /^(ወቸው\s*GOOD|@?WECHEW\s*GOOD)$/i.test(parts[parts.length - 1])
  ) {
    parts.pop();
  }
  const headline = parts[0] || raw;
  const guest = parts.length > 1 ? parts[parts.length - 1] : null;
  return { headline, guest: guest && guest !== headline ? guest : null };
}

function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map((m) => {
      const block = m[1];
      const grab = (re) => {
        const hit = block.match(re);
        return hit ? hit[1].trim() : '';
      };
      const id = grab(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const rawTitle =
        grab(/<media:title>([^<]*)<\/media:title>/) ||
        grab(/<title>([^<]*)<\/title>/);
      const { headline, guest } = parseTitle(rawTitle);
      return {
        id,
        headline,
        guest,
        published: grab(/<published>([^<]+)<\/published>/).slice(0, 10),
        views: Number(grab(/views="(\d+)"/) || 0),
        duration: null,
        url: `https://www.youtube.com/watch?v=${id}`,
        embed: `https://www.youtube-nocookie.com/embed/${id}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    })
    .filter((e) => e.id);
}

async function youtubeXml() {
  const r = await fetch(FEED, {
    headers: { 'User-Agent': 'wechew-good-site-local/1.0' },
  });
  if (!r.ok) throw new Error(`YouTube feed HTTP ${r.status}`);
  return r.text();
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    if (url.pathname === '/feed/youtube.xml') {
      const xml = await youtubeXml();
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(xml);
      return;
    }
    if (url.pathname === '/api/episodes') {
      const episodes = parseFeed(await youtubeXml());
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          channelId: CHANNEL_ID,
          source: 'youtube-rss',
          fetchedAt: new Date().toISOString(),
          episodes,
        })
      );
      return;
    }

    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const file = normalize(join(__dirname, path));
    if (!file.startsWith(__dirname) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(err.message || err));
  }
}).listen(PORT, () => {
  console.log(`Serving http://localhost:${PORT} (YouTube feed proxied)`);
});
