(() => {
  const CHANNEL_ID = 'UCJD-UtyBgYWqvmp_lknn7Lg';
  const YT_FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  const $ = (s) => document.querySelector(s);
  const V = (v) =>
    v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1e3) + 'K';
  const dt = (s) =>
    new Date(s).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const fill = (s, h) => {
    const n = $(s);
    if (n) n.innerHTML = h;
  };
  const card = (e) =>
    `<article class="card"><a class="thumb" href="${e.url}" target="_blank" rel="noopener" aria-label="Watch ${e.headline}"><img src="${e.thumbnail}" alt="" loading="lazy">${e.duration ? `<span class="dur">${e.duration}</span>` : ''}</a><div class="cb"><h3 class="am">${e.headline}</h3><p>${e.guest || 'ወቸው GOOD'} · ${dt(e.published)} · ${V(e.views)} views</p></div></article>`;

  const parseTitle = (raw) => {
    const parts = String(raw || '')
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);
    // Titles are "headline|guest|ወቸው GOOD|" — drop trailing show tags only
    while (
      parts.length &&
      /^(ወቸው\s*GOOD|@?WECHEW\s*GOOD)$/i.test(parts[parts.length - 1])
    ) {
      parts.pop();
    }
    const headline = parts[0] || raw;
    const guest = parts.length > 1 ? parts[parts.length - 1] : null;
    return { headline, guest: guest && guest !== headline ? guest : null };
  };

  const fromEntryXml = (block) => {
    const grab = (re) => {
      const hit = block.match(re);
      return hit ? hit[1].trim() : '';
    };
    const id = grab(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!id) return null;
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
  };

  const parseAtom = (xml) =>
    [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      .map((m) => fromEntryXml(m[1]))
      .filter(Boolean);

  const mergeDurations = (episodes, fallback) => {
    const map = Object.fromEntries(
      (fallback || []).filter((e) => e.duration).map((e) => [e.id, e.duration])
    );
    return episodes.map((e) =>
      !e.duration && map[e.id] ? { ...e, duration: map[e.id] } : e
    );
  };

  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.text();
  }

  async function fetchJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
  }

  async function loadEpisodes(fallback) {
    const attempts = [
      async () => {
        const data = await fetchJson('/api/episodes');
        if (!data.episodes?.length) throw new Error('empty api');
        return data.episodes;
      },
      async () => parseAtom(await fetchText('/feed/youtube.xml')),
      async () => parseAtom(await fetchText(YT_FEED)),
      async () => {
        const proxied = await fetchText(
          'https://api.allorigins.win/raw?url=' + encodeURIComponent(YT_FEED)
        );
        return parseAtom(proxied);
      },
      async () => {
        const data = await fetchJson(
          'https://api.rss2json.com/v1/api.json?rss_url=' +
            encodeURIComponent(YT_FEED)
        );
        if (data.status !== 'ok' || !data.items?.length)
          throw new Error('rss2json failed');
        return data.items.map((item) => {
          const id = (item.guid || item.link || '').replace(/^.*v=/, '').replace(/^yt:video:/, '');
          const { headline, guest } = parseTitle(item.title);
          return {
            id,
            headline,
            guest,
            published: (item.pubDate || '').slice(0, 10) || item.pubDate,
            views: Number(item.viewCount || item.views || 0),
            duration: null,
            url: item.link || `https://www.youtube.com/watch?v=${id}`,
            embed: `https://www.youtube-nocookie.com/embed/${id}`,
            thumbnail:
              item.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          };
        });
      },
    ];

    for (const attempt of attempts) {
      try {
        const episodes = await attempt();
        if (episodes?.length) return mergeDurations(episodes, fallback);
      } catch (_) {
        /* try next source */
      }
    }
    return fallback || [];
  }

  function render(D) {
    const E = D.episodes || [];
    const m = $('#menu');
    const l = $('#links');
    if (m && l)
      m.onclick = () =>
        m.setAttribute('aria-expanded', l.classList.toggle('open'));

    if (!E.length) {
      fill('#latest-info', '<p>Could not load episodes from YouTube.</p>');
      fill('#grid', '<p>Could not load episodes from YouTube.</p>');
      return;
    }

    const player = (e) =>
      `<div class="player"><img src="${e.thumbnail}" alt="Thumbnail of ${e.headline}"><button class="play" aria-label="Play video">&#9654;</button></div>`;
    fill('#latest', player(E[0]));
    const pl = $('.player');
    if (pl)
      pl.onclick = () => {
        pl.innerHTML = `<iframe src="${E[0].embed}?autoplay=1" title="${E[0].headline}" allow="autoplay;encrypted-media;fullscreen" allowfullscreen></iframe>`;
      };
    fill(
      '#latest-info',
      `<p class="am" style="font-size:1.4rem;font-weight:800">${E[0].headline}</p><p>${E[0].guest || ''} · ${dt(E[0].published)}</p><a class="btn" href="${E[0].url}" target="_blank" rel="noopener">Watch on YouTube</a>`
    );

    const top = [...E].sort((a, b) => b.views - a.views);
    fill('#watched', top.slice(0, 3).map(card).join(''));

    if ($('#grid')) {
      const q = $('#q');
      const s = $('#sort');
      q.value = new URLSearchParams(location.search).get('q') || '';
      const r = () => {
        const t = q.value.toLowerCase();
        let a = E.filter((e) =>
          (e.headline + ' ' + (e.guest || '')).toLowerCase().includes(t)
        );
        if (s.value == 'views') a.sort((x, y) => y.views - x.views);
        fill(
          '#grid',
          a.map(card).join('') || '<p>No episodes match. Try another name.</p>'
        );
        $('#count').textContent = a.length + ' episodes';
      };
      q.oninput = s.onchange = r;
      r();
    }

    fill(
      '#guests',
      E.filter((e) => e.guest)
        .map(
          (e) =>
            `<a class="card tm" href="episodes.html?q=${encodeURIComponent(e.guest)}" style="text-decoration:none;display:block"><div class="av">${e.guest[0]}</div><h3>${e.guest}</h3><p class="am">${e.headline}</p><p><b>${V(e.views)} views</b></p></a>`
        )
        .join('')
    );

    if (D.team) {
      fill(
        '#team',
        D.team
          .map(
            (t) =>
              `<div class="card tm"><div class="av">${t.name[0]}</div><h3>${t.name}</h3><p>${t.role}</p><a href="${t.instagram}" target="_blank" rel="noopener">Instagram</a></div>`
          )
          .join('')
      );
    }

    const tot = E.reduce((a, e) => a + (e.views || 0), 0);
    fill(
      '#kit',
      [
        [V(tot), 'views across the latest ' + E.length + ' episodes'],
        [V(Math.round(tot / E.length)), 'average views per episode'],
        ['Weekly', 'new episode every Saturday'],
        [V(top[0].views), 'best episode: ' + (top[0].guest || top[0].headline)],
      ]
        .map(
          (x) =>
            `<div class="stat"><b>${x[0]}</b><span>${x[1]}</span></div>`
        )
        .join('')
    );
  }

  async function boot() {
    const base = window.DATA || { channel: {}, team: [], episodes: [] };
    fill('#latest-info', '<p>Loading latest episodes from YouTube…</p>');
    if ($('#grid')) fill('#grid', '<p>Loading episodes from YouTube…</p>');
    if ($('#count')) $('#count').textContent = 'Loading…';

    const episodes = await loadEpisodes(base.episodes);
    render({ ...base, episodes });
  }

  boot();
})();
