// Vercel / Netlify serverless function — proxies lyrics lookups so that
// GitHub Pages (a static host) can still fetch from Genius / Musixmatch
// without exposing API keys to the browser.
//
// Deploy options:
//   • Vercel: drop this whole repo into Vercel and set GENIUS_ACCESS_TOKEN
//     (and optionally MUSIXMATCH_API_KEY) as project env vars. The endpoint
//     becomes https://<project>.vercel.app/api/lyrics
//   • Netlify: rename to netlify/functions/lyrics.js and tweak handler shape.
//
// Endpoint contract:
//   GET /api/lyrics?artist=<a>&title=<t>
//   200 -> { artist, title, lyrics, source, url }
//   4xx/5xx -> { error: "..." }

module.exports = async function handler(req, res) {
  // CORS — GitHub Pages calls this from a different origin
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { artist = "", title = "" } = req.query || {};
  if (!artist || !title) {
    return res.status(400).json({ error: "Missing artist or title query params." });
  }

  // 1) Try Genius
  const geniusToken = process.env.GENIUS_ACCESS_TOKEN;
  if (geniusToken) {
    try {
      const out = await tryGenius(artist, title, geniusToken);
      if (out && out.lyrics) return res.status(200).json(out);
    } catch (e) {
      console.warn("Genius failed:", e.message);
    }
  }

  // 2) Fall back to Musixmatch (returns ~30% preview on free tier)
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
    error:
      "No lyrics found. Configure GENIUS_ACCESS_TOKEN or MUSIXMATCH_API_KEY env vars on your proxy deploy, or paste lyrics manually.",
  });
};

// -----------------------------------------------------------------
// Genius
// -----------------------------------------------------------------
async function tryGenius(artist, title, token) {
  const q = encodeURIComponent(`${artist} ${title}`);
  const searchRes = await fetch(`https://api.genius.com/search?q=${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok) throw new Error(`Genius search ${searchRes.status}`);
  const search = await searchRes.json();
  const hit = (search.response?.hits || []).find(
    (h) => h.type === "song" && h.result?.url,
  );
  if (!hit) return null;

  const songUrl = hit.result.url;
  const pageRes = await fetch(songUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LyricLoom/1.0; +https://github.com/) - personal/fan use",
    },
  });
  if (!pageRes.ok) throw new Error(`Genius page ${pageRes.status}`);
  const html = await pageRes.text();

  const lyrics = extractGeniusLyrics(html);
  if (!lyrics) return null;

  return {
    artist: hit.result.primary_artist?.name || artist,
    title: hit.result.title || title,
    lyrics,
    source: "genius",
    url: songUrl,
  };
}

// Strip lyrics from Genius's HTML. They put them inside one or more
// <div data-lyrics-container="true">…</div> blocks.
function extractGeniusLyrics(html) {
  const blocks = [];
  const re = /<div[^>]*data-lyrics-container=["']true["'][^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  if (!blocks.length) return null;

  const joined = blocks
    .map((b) =>
      b
        // Convert <br> tags to newlines first
        .replace(/<br\s*\/?>/gi, "\n")
        // Drop all other tags
        .replace(/<[^>]+>/g, "")
        // Decode common entities
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
// Musixmatch (free tier returns a 30% preview)
// -----------------------------------------------------------------
async function tryMusixmatch(artist, title, apiKey) {
  const url =
    `https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?format=json&q_track=${encodeURIComponent(title)}&q_artist=${encodeURIComponent(artist)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Musixmatch ${res.status}`);
  const data = await res.json();
  const body = data?.message?.body;
  const lyrics = body?.lyrics?.lyrics_body;
  if (!lyrics) return null;
  return {
    artist,
    title,
    // Strip the trademark notice line that musixmatch appends
    lyrics: lyrics
      .replace(/\*+ This Lyrics is NOT for Commercial use \*+/i, "")
      .trim(),
    source: "musixmatch (preview only)",
    url: null,
  };
}
