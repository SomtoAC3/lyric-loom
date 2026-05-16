# Lyric Loom

A kinetic-typography lyric visualizer for the browser. Upload a photo or video, attach a song, pick a font and animation style, and export the result as a PNG or MP4.

The frontend is plain HTML/CSS/JS — it deploys to GitHub Pages with zero build. Lyrics auto-fetch goes through a tiny serverless function (Vercel/Netlify) so your API keys stay off the public site. Manual paste always works as a fallback.

---

## What's in here

```
lyric-loom/
├── index.html          ← the app
├── styles.css
├── js/
│   ├── config.js       ← set LYRICS_PROXY_URL here
│   ├── state.js
│   ├── lyrics.js       ← calls the proxy + parses LRC-style timestamps
│   ├── canvas.js       ← background, filters, vignette, attribution
│   ├── animations.js   ← kinetic typography engine
│   ├── export.js       ← PNG + MP4/WebM
│   └── app.js          ← UI wiring + render loop
├── api/
│   └── lyrics.js       ← Vercel serverless function (Genius + Musixmatch)
├── vercel.json
└── package.json
```

---

## Run locally

```bash
cd lyric-loom
python3 -m http.server 8080
# open http://localhost:8080
```

No build step. Edit a file, refresh.

---

## Deploy the frontend to GitHub Pages

1. Push the `lyric-loom/` folder to a GitHub repo (root of the repo, or rename to `docs/`).
2. Repo → Settings → Pages → Source: `main` branch, `/` (root) or `/docs`.
3. Done. Your site lives at `https://<user>.github.io/<repo>/`.

GitHub Pages is static-only, so the lyrics auto-fetch button won't work until you also deploy the proxy (next section).

---

## Deploy the lyrics proxy (optional)

You need this only if you want the "Fetch lyrics" button to work. Without it, users can still paste lyrics directly into the textarea.

### Option A — Vercel (recommended, free tier)

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com), "Add new project", import the repo.
3. Build settings: framework preset = **Other**. Output dir = `./`. No build command.
4. Add environment variables (Project → Settings → Environment Variables):
   - `GENIUS_ACCESS_TOKEN` — get a free one at [genius.com/api-clients](https://genius.com/api-clients). Click "Generate Access Token".
   - *(optional)* `MUSIXMATCH_API_KEY` — free tier returns ~30% lyrics preview, used as a fallback if Genius can't find the song.
5. Deploy. Your endpoint becomes `https://<project>.vercel.app/api/lyrics`.
6. Back in this repo, open `js/config.js` and set:
   ```js
   LYRICS_PROXY_URL: "https://<project>.vercel.app/api/lyrics",
   ```
7. Push again — GitHub Pages picks it up.

### Option B — Netlify

Move `api/lyrics.js` to `netlify/functions/lyrics.js` and tweak the handler signature to Netlify's shape (`exports.handler = async (event) => { ... }` with `event.queryStringParameters` instead of `req.query`). Set the same env vars in Netlify's dashboard.

### Option C — No proxy

Leave `LYRICS_PROXY_URL` empty. The fetch button errors with a clear message, but the manual paste textarea still works.

---

## Using the app

1. **Background** — drag a photo or video in, or click "Choose photo or video". Tune darken/blur/brightness/vignette/overlay until the text will read clearly.
2. **Song & lyrics** — type artist + title, click *Fetch lyrics*, or just paste them in. One lyric per line. You can edit them.
3. **Type & motion** — pick a font, color, animation style. *Kinetic mix* gives each word a different entrance.
4. **Optional audio** — attach an audio file you have the rights to. Required if you want the MP4 to have sound.
5. **Aspect** — choose 4:5, 9:16, 1:1, or 16:9 to match where you'll post it.
6. **Press play** to preview. Press *PNG* to save a still frame, *Record MP4* to capture a video. Recording auto-stops when the lyrics finish.

### Synced lyrics (karaoke timing)

The textarea also accepts LRC-style timestamps. Each timestamped line will appear at exactly that moment instead of being auto-paced:

```
[00:00.50] Welcome to Lyric Loom
[00:03.20] Upload a photo or video
[00:06.00] Pick a font, pick a color
```

You can write these by ear, or paste from any LRC source.

---

## Browser support

- **Chrome / Edge 126+** — full MP4 recording.
- **Firefox / older Chrome** — records WebM instead of MP4 (the file is still playable, and convertible to MP4 with any tool like HandBrake or ffmpeg).
- **Safari 17+** — works, MP4 recording via MediaRecorder is supported on recent versions.
- **iOS Safari** — preview works; recording quality is limited and varies by version.

PNG export works everywhere.

---

## Copyright

Lyric Loom does **not** host or distribute lyrics — it only displays what the user pastes in or what their own configured proxy fetches from a public source. The lyrics shown belong to their writers and publishers.

**Personal and fan-creative use only.** Don't monetize, sell, or commercially distribute videos containing copyrighted lyrics or recordings without a license from the rights holders. The "always show artist credit" toggle is on by default — keep it on.

Different countries have different rules (fair use in the US, fair dealing in the UK/Canada, etc.). This tool does not grant any license to copyrighted material; it just helps you draw with words.

---

## License

The code in this repo is MIT-licensed. Lyric and song content fetched/displayed is not — see the copyright note above.
