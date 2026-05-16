// Vercel / Netlify serverless function -- proxies lyrics lookups so that
// GitHub Pages (a static host) can still fetch from LRCLib (and optionally
// Genius / Musixmatch) without exposing API keys to the browser.
//
// LRCLib is the default: free, no key, no blocking, CORS-friendly, and it
// returns BOTH plain lyrics and time-synced (LRC) lyrics when available.
// Genius and Musixmatch remain as optional fallbacks.
//
// Endpoint contract:
//   GET /api/lyrics?artist=<a>&title=<t>
//   200 -> { artist, title, lyrics, syncedLyrics?, source, url? }
//   404 -> { error: "..." }

module.exports = async function handler(req, res) {
  // CORS -- GitHub Pages calls this from a different origin.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { artist = "", title = "" } = req.query || {};
  if (!artist || !title) {
    return res.status(400).json({ error: "Missing artist or title query params." });
  }

  // 1) Try LRCLib (free, no key, has synced lyrics).
  try {
    const out = await tryLrclib(artist, title);
    if (out && out.lyrics) return res.status(200).json(out);
  } catch (e) {
    console.warn("LRCLib failed:", e.message);
  }

  // 2) Optional Genius fallback. Usually blocked from Vercel IPs (HTTP 403),
  // but kept here in case you self-host or proxy from elsewhere.
  const geniusToken = process.env.GENIUS_ACCESS_TOKEN;
  if (geniusToken) {
    try {
      const out = await tryGenius(artist, title, geniusToken);
      if (out && out.lyrics) return res.status(200).json(out);
    } catch (e) {
      console.warn("Genius failed:", e.message);
    }
  }

  // 3) Optional Musixmatch fallback (free tier returns ~30% preview).
  const mxmKey = process.env.MUSIXMATCH_API_KEY;
  if (mxmKey) {
    try {
      const out = await tryMusixmatch(artist, title, mxmKey);
      if (out && out.lyrics) return res.status(200).json(out);
    } catch (e) {
      console.warn("Musixmatch failed:", e.message);
    }
  }

  return res.status(404).json({
    error: "No lyrics found. Try a different spelling, or paste lyrics manually.",
  });
};

// -----------------------------------------------------------------
// LRCLib (https://lrclib.net) -- primary source.
// -----------------------------------------------------------------
async function tryLrclib(artist, title) {
  // /api/get is exact match; /api/search is fuzzy. Try exact first.
  const exactUrl =
    "https://lrclib.net/api/get" +
    "?artist_name=" + encodeURIComponent(artist) +
    "&track_name=" + encodeURIComponent(title);

  let res = await fetch(exactUrl, {
    headers: { "User-Agent": "LyricLoom (https://github.com)" },
  });

  let data;
  if (res.ok) {
    data = await res.json();
  } else if (res.status === 404) {
    // Fall back to fuzzy search.
    const searchUrl =
      "https://lrclib.net/api/search" +
      "?artist_name=" + encodeURIComponent(artist) +
      "&track_name=" + encodeURIComponent(title);
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "LyricLoom (https://github.com)" },
    });
    if (!searchRes.ok) throw new Error("LRCLib search " + searchRes.status);
    const list = await searchRes.json();
    if (!Array.isArray(list) || !list.length) return null;
    data = list[0];
  } else {
    throw new Error("LRCLib " + res.status);
  }

  const plain = data.plainLyrics || (data.syncedLyrics
    ? data.syncedLyrics.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/g, "").trim()
    : null);

  if (!plain && !data.syncedLyrics) return null;

  return {
    artist: data.artistName || artist,
    title: data.trackName || title,
    lyrics: plain || "",
    syncedLyrics: data.syncedLyrics || null,
    source: data.syncedLyrics ? "lrclib (synced)" : "lrclib",
    url: null,
  };
}

// -----------------------------------------------------------------
// Genius -- optional fallback. Usually blocked from Vercel IPs.
// -----------------------------------------------------------------
async function tryGenius(artist, title, token) {
  const q = encodeURIComponent(artist + " " + title);
  const searchRes = await fetch("https://api.genius.com/search?q=" + q, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!searchRes.ok) throw new Error("Genius search " + searchRes.status);
  const search = await searchRes.json();
  const hit = (search.response && search.response.hits || []).find(
    (h) => h.type === "song" && h.result && h.result.url,
  );
  if (!hit) return null;

  const songUrl = hit.result.url;
  const pageRes = await fetch(songUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!pageRes.ok) throw new Error("Genius page " + pageRes.status);
  const html = await pageRes.text();

  const lyrics = extractGeniusLyrics(html);
  if (!lyrics) return null;

  return {
    artist: (hit.result.primary_artist && hit.result.primary_artist.name) || artist,
    title: hit.result.title || title,
    lyrics: lyrics,
    source: "genius",
    url: songUrl,
  };
}

function extractGeniusLyrics(html) {
  const blocks = [];
  const re = /<div[^>]*data-lyrics-container=["']true["'][^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  if (!blocks.length) return null;

  const joined = blocks
    .map((b) =>
      b
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, " "),
    )
    .join("\n");

  return joined
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

// -----------------------------------------------------------------
// Musixmatch -- optional fallback (returns ~30% preview on free tier).
// -----------------------------------------------------------------
async function tryMusixmatch(artist, title, apiKey) {
  const url =
    "https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?format=json" +
    "&q_track=" + encodeURIComponent(title) +
    "&q_artist=" + encodeURIComponent(artist) +
    "&apikey=" + apiKey;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Musixmatch " + res.status);
  const data = await res.json();
  const body = data && data.message && data.message.body;
  const lyrics = body && body.lyrics && body.lyrics.lyrics_body;
  if (!lyrics) return null;
  return {
    artist: artist,
    title: title,
    lyrics: lyrics
      .replace(/\*+ This Lyrics is NOT for Commercial use \*+/i, "")
      .trim(),
    source: "musixmatch (preview only)",
    url: null,
  };
}
