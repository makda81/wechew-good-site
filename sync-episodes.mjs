#!/usr/bin/env node
/**
 * Pull latest videos from the ወቸው GOOD YouTube RSS feed and refresh
 * episodes.json + data.js (static fallback used when live fetch is unavailable).
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANNEL_ID = 'UCJD-UtyBgYWqvmp_lknn7Lg';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

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

const res = await fetch(FEED, {
  headers: { 'User-Agent': 'wechew-good-site-sync/1.0' },
});
if (!res.ok) {
  console.error('Failed to fetch YouTube feed:', res.status);
  process.exit(1);
}

const episodes = parseFeed(await res.text());
const prevPath = join(__dirname, 'episodes.json');
const prev = existsSync(prevPath)
  ? JSON.parse(readFileSync(prevPath, 'utf8'))
  : { channel: {}, team: [], episodes: [] };

// Keep durations from previous snapshot when YouTube RSS omits them
const durationById = Object.fromEntries(
  (prev.episodes || []).filter((e) => e.duration).map((e) => [e.id, e.duration])
);
for (const ep of episodes) {
  if (!ep.duration && durationById[ep.id]) ep.duration = durationById[ep.id];
}

const data = {
  channel: prev.channel || {
    name: 'ወቸው GOOD',
    handle: '@WECHEWGOOD',
    channelId: CHANNEL_ID,
    url: 'https://www.youtube.com/@WECHEWGOOD',
  },
  team: prev.team || [],
  episodes,
};

writeFileSync(prevPath, JSON.stringify(data, null, 1) + '\n', 'utf8');
writeFileSync(
  join(__dirname, 'data.js'),
  `window.DATA=${JSON.stringify(data)};\n`,
  'utf8'
);

console.log(`Synced ${episodes.length} episodes from YouTube channel ${CHANNEL_ID}`);
console.log(`Latest: ${episodes[0]?.headline} (${episodes[0]?.id}) · ${episodes[0]?.views} views`);
