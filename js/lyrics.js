// lyrics.js — talks to the proxy at LYRIC_LOOM_CONFIG.LYRICS_PROXY_URL.
// The proxy is expected to return:
//   { artist, title, lyrics: "...full text...", source: "genius|musixmatch", url }
// or { error: "..." } on failure.

window.LL_Lyrics = (function () {
  async function fetchLyrics(artist, title) {
    const proxy = (window.LYRIC_LOOM_CONFIG || {}).LYRICS_PROXY_URL;
    if (!proxy) {
      throw new Error("No proxy configured. Set LYRICS_PROXY_URL in js/config.js or paste lyrics manually.");
    }
    const url = `${proxy.replace(/\/$/, "")}?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Proxy ${res.status}: ${body || res.statusText}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.lyrics) throw new Error("No lyrics returned");
    return data;
  }

  // Parse plain lyrics text to the {text, start, end} array used by anims.
  // Recognizes [mm:ss.xx] LRC-style timestamps if present; otherwise leaves
  // start/end as null and the animation system auto-times.
  function parseLyrics(raw) {
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const lrcRe = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/;
    const out = [];
    for (const line of lines) {
      const m = line.match(lrcRe);
      if (m) {
        const minutes = parseInt(m[1], 10);
        const seconds = parseInt(m[2], 10);
        const fracStr = m[3] || "0";
        const frac = parseInt(fracStr.padEnd(3, "0"), 10) / 1000;
        const t = minutes * 60 + seconds + frac;
        const text = (m[4] || "").trim();
        if (text) out.push({ text, start: t, end: null });
      } else if (!/^\[.+\]$/.test(line)) {
        // Skip section markers like [Chorus]
        out.push({ text: line, start: null, end: null });
      }
    }
    // If any had timestamps, fill in end times from neighbors
    if (out.some((l) => l.start != null)) {
      for (let i = 0; i < out.length; i++) {
        if (out[i].start != null) {
          const next = out.slice(i + 1).find((l) => l.start != null);
          out[i].end = next ? next.start : out[i].start + 4;
        }
      }
      return out.filter((l) => l.start != null);
    }
    return out;
  }

  async function searchSongs(query) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=6`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    return (data.results || []).map((r) => ({
      artist: r.artistName,
      title: r.trackName,
    }));
  }

  return { fetchLyrics, parseLyrics, searchSongs };
})();
