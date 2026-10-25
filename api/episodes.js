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
      const { headline, guest } = parseTitle(grab(/<media:title>([^<]*)<\/media:title>/) || grab(/<title>([^<]*)<\/title>/));
      const published = grab(/<published>([^<]+)<\/published>/).slice(0, 10);
      const views = Number(grab(/views="(\d+)"/) || 0);
      return {
        id,
        headline,
        guest,
        published,
        views,
        duration: null,
        url: `https://www.youtube.com/watch?v=${id}`,
        embed: `https://www.youtube-nocookie.com/embed/${id}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    })
    .filter((e) => e.id);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const r = await fetch(FEED, {
      headers: { 'User-Agent': 'wechew-good-site/1.0' },
    });
    if (!r.ok) throw new Error(`YouTube feed HTTP ${r.status}`);
    const episodes = parseFeed(await r.text());
    res.status(200).json({
      channelId: CHANNEL_ID,
      source: 'youtube-rss',
      fetchedAt: new Date().toISOString(),
      episodes,
    });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
};
