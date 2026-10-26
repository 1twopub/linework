# Linework

Draw something in black ink. Linework reads the linework (what it looks like and how it was drawn) and finds a release on Spotify to match.

A static site: no build step, no server, no dependencies. It runs from GitHub Pages as-is.

## How a drawing becomes a record

1. **Content (the motif).** Each stroke is classified (circle, spiral, star, zigzag, wave, peak, line, box, heart, crescent, almond, cloud, flower, bird, arrow, crown, diamond, drop, flame, S-curve, scribble, dot…), then the whole drawing is read as one of 40 motifs: a face, sun, circle, spiral, star, grid, rainfall, field of dots, zigzag, peak, wave, loops, horizon, single line, scribble, heart, house, flower, crescent moon, eye, cross, box, arrow, stick figure, bird, cloud, crown, diamond, drop, flame, dollar sign, music note, clock, globe, skull (a face with X eyes), car, phone (a tall rectangle), screen (a wide rectangle), speech bubble, or an abstraction. The motif picks the search keyword, e.g. a spiral searches for *spiral*, *vertigo*, *galaxy*, *hypnotic*.
2. **Linework (the character).** Seven measurements, each 0–1:
   speed of drawing, angularity (corners), curvature, ink density, chaos (strokes, jitter, crossings), lift (how high on the page), and symmetry.
   These are matched against profiles for 44 genres (including trap, cloud rap, drill, grime, R&B, dancehall, Latin and comedy) (jagged + fast + dense → punk or metal; slow, flowing, sparse → ambient or bossa nova) and choose an era.
3. **Search.** Linework searches Spotify for tracks matching the keyword, genre and decade, and loosens the search step by step if nothing comes back. The release is the album the matching track belongs to.
4. **Deterministic.** The same drawing always gives the same record; a slightly different one usually gives a different record.

All of this is in `js/analyze.js` (drawing analysis) and `js/mapping.js` (keywords, genre profiles, search plan). Edit the word lists and genre profiles there to change the personality.

## Two modes

- **Catalog mode (public).** If a `catalog.json` sits next to `index.html`, the app matches drawings against that list of records. Nobody logs in, there are no API calls and no rate limits, so it works for any number of visitors. This is the mode to publish.
- **Live search mode (private).** With no `catalog.json`, the app searches Spotify live. Each person must log in, and Spotify's development mode allows only 5 approved accounts.

## Build the catalog from a playlist

1. Deploy the site (below) and set up your Spotify app (see *Connect Spotify*). Register **both** Redirect URIs:
   `https://<username>.github.io/<repo>/` and `https://<username>.github.io/<repo>/build.html`
2. Open `https://<username>.github.io/<repo>/build.html`, paste your Client ID and log in.
3. Paste a playlist link and press **Build catalog**. The playlist must be **yours** (or one you collaborate on): since February 2026 Spotify only lets development-mode apps read the tracks of those. To use someone else's playlist, select all its tracks in Spotify and add them to a new playlist of your own.
4. Review the tags. Each record gets:
   - **motifs** found in its album title and the track titles on your playlist ("Here Comes the Sun" → sun, "Rain on Glass" → rain). Records with no motif are still matched on linework.
   - a **genre** from the artist's tags on [MusicBrainz](https://musicbrainz.org), the free open music database, which places the record in linework space (jagged + fast drawings → punk, slow flowing ones → ambient…). Specific tags win over broad ones, so "shoegaze" beats "rock". Artists MusicBrainz doesn't know end up without a genre; set those by hand with the "Needs genre" filter.
   Edits are saved in your browser as you go, and kept when you rebuild (unless you untick *Keep my hand edits*).

   **Speed and limits.** Spotify is used only to read the playlist: one request per 50 tracks, so a 300-track playlist costs about 7 requests. MusicBrainz allows about one request per second, so genres take roughly one second per artist (about 5 minutes for 300 artists). Lookups are remembered in your browser, so a rebuild, or a build interrupted by closing the page, only looks up artists it hasn't seen.
5. **Preview in app** opens the app using your draft, without publishing.
6. **Download catalog.json**, add it to the repo root next to `index.html`, and push. The live site switches to catalog mode for everyone.

To update the catalog later, add records to the playlist and build again. A playlist of 150–500 albums with varied titles gives the best spread; titles that mention suns, rain, stars, waves, mountains, cities, faces and so on give drawings something to latch onto.

How matching works: each record is linked to motifs in three tiers, strongest first:
1. **Title**: a title names the thing ("Moonlight" → moon).
2. **Title hint**: a title suggests it ("baby" → heart, "east" → arrow, a city → globe, "1988" → clock). The word lists are `HINT_PATTERNS` in `js/catalog.js`.
3. **Sound**: only for records whose titles give nothing, the genre suggests a motif (drill → zigzag, reggae → sun). See `SOUND_MOTIFS`.

A related motif in a title (a sun drawing → a "moon" record) counts a little. Among the best-linked records, the one whose genre profile is closest to the drawing's linework wins. The result card says which tier linked the record. The pick is deterministic, so the same drawing always gives the same record.

### The included catalogs

- `catalog.json` (live): 1,820 releases from the *Lovers Rock* playlist, built from a CSV export.
- `catalog-reflecting.json` (spare): 635 releases from the *Reflecting* playlist. To use it, rename it to `catalog.json`.

Genres were assigned by hand from the artists. Records whose genre is a low-confidence guess carry `"genreGuess": true`; in the builder, the **Unsure genre** filter lists them for checking. Rebuilding from the playlist in the builder keeps these genres for any artist MusicBrainz has no tags for.

## The feed (anonymous posts)

After seeing their record, people can tap **Post to the feed** to share the drawing anonymously, with an optional caption. `feed.html` shows the newest posts, each drawing next to its record.

How it works without a database:

1. The site sends the drawing (a compact code) to a small **Cloudflare Worker**, `worker/linework-relay.js`.
2. The Worker holds a GitHub token as a secret and files the post as an **issue** in this repo, under your account, so posters need no account and nothing about them is stored.
3. Each new or closed issue triggers `.github/workflows/pages.yml`, which runs `scripts/build-feed.mjs`. It recomputes every post's motif and record from the drawing itself (so a tampered issue can't fake a match), writes `feed.json` and redeploys the site. Posts appear about a minute or two after posting.

**Moderation:** close an issue to remove that post (reopen to restore). Only issues filed by the relay's account count, so nobody else can add posts by opening issues. The feed keeps the newest 300.

### Setting it up (about 15 minutes, all free)

1. **Pages source.** Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Label (optional).** Repo **Issues → Labels → New label**, named `linework-post`. Posts are recognised by a marker in the issue text, so this only helps you filter them; GitHub may not apply it with an issues-only token.
3. **GitHub token.** Go to github.com → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Repository access: **Only select repositories**, this repo.
   - Permissions: **Issues: Read and write** (nothing else).
   - Note the expiry date; posting stops when it expires, so set a reminder to renew it.
4. **Cloudflare Worker.** Create a free account at cloudflare.com, then **Workers & Pages → Create → Create Worker**, name it `linework-relay`, **Deploy**, then **Edit code**: replace everything with the contents of `worker/linework-relay.js` and **Deploy** again.
   In the Worker's **Settings → Variables and Secrets**, add:
   - `GITHUB_REPO` (Text): `yourname/yourrepo`
   - `ALLOWED_ORIGIN` (Text): `https://yourname.github.io` (no path, no trailing slash)
   - `GITHUB_TOKEN` (Secret): the token from step 3
5. **Point the site at it.** In `config.js`, set `POST_URL` to the Worker's address (shown on its page, like `https://linework-relay.yourname.workers.dev`), then push.
6. **Optional, recommended once public: bot protection.** In Cloudflare, **Turnstile → Add widget** for `yourname.github.io`. Put the site key in `config.js` as `TURNSTILE_SITEKEY`, and add the secret key to the Worker as a Secret named `TURNSTILE_SECRET`. Posting then requires passing Cloudflare's check.

If the token belongs to a different account than the repo owner (a bot account, say), add a repository variable `FEED_AUTHOR` with that account's login (**Settings → Secrets and variables → Actions → Variables**).

Built-in limits: captions up to 140 characters with no links; each visitor can post 5 times per 10 minutes (best effort); very detailed drawings are simplified, and extremely detailed ones are refused. Cloudflare's free plan allows 100,000 requests a day.

## Deploy to GitHub Pages

1. Create a repository and push the contents of this folder to the `main` branch (the files should sit at the repo root).
2. In the repo: **Settings → Pages**. Either:
   - **Source: Deploy from a branch** → `main` / `(root)`, or
   - **Source: GitHub Actions** (the included `.github/workflows/pages.yml` then deploys on every push).
3. Your site will be at `https://<username>.github.io/<repo>/`.

## Connect Spotify

Spotify's Web API needs an app Client ID. Linework uses the PKCE login flow, which needs no secret, so it is safe in a public static site.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and **Create app**. Choose **Web API**.
2. Add your Pages URL as a **Redirect URI**, exactly, with the trailing slash, e.g. `https://<username>.github.io/<repo>/`. (The app's settings sheet shows the exact value and a copy button.)
3. Copy the Client ID, then either:
   - put it in `config.js` (`export const CLIENT_ID = '...'`) so every visitor uses your app, or
   - leave `config.js` empty and paste it into the app's settings sheet (stored only in that browser).

### Spotify's development-mode limits (2026)

New Spotify apps start in development mode, which since February 2026 means:

- The app owner needs **Spotify Premium**.
- Only accounts you add under **User Management** in the dashboard can log in (a small number, currently 5).
- Search returns at most 10 results per request (Linework is built around this).

To open it to the public you'd need Spotify's extended quota, which they currently grant to organizations only. For a personal or small-group project, development mode works fine.

Without a Client ID (or for someone who isn't on the allowlist), Linework still reads the drawing and offers a **Search Spotify** link for the matching keyword and genre, which works for anyone.

## Run locally

Any static server works, for example:

```sh
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/`. To log in locally, add `http://127.0.0.1:8000/` as a Redirect URI too (Spotify accepts loopback addresses over plain http, but not `localhost`).

## Files

```
index.html               page structure
style.css                mobile-first styles (light and dark)
config.js                optional Spotify Client ID
build.html               catalog builder (playlist → catalog.json)
feed.html                the public feed of posted drawings
js/feed.js               feed page
js/share.js              compact drawing codes for posting
scripts/build-feed.mjs   builds feed.json from post issues (run by the workflow)
worker/linework-relay.js Cloudflare Worker that files anonymous posts as issues
catalog.json             your catalog (you add this; not included)
js/app.js                canvas, screens, settings
js/build.js              catalog builder logic
js/catalog.js            title motifs, genre mapping, drawing → record matching
js/musicbrainz.js        MusicBrainz genre lookups (throttled and cached)
js/analyze.js            stroke geometry, motif detection, linework features
js/mapping.js            motif keywords, genre profiles, search plan
js/spotify.js            PKCE login, token refresh, search
manifest.webmanifest     add-to-home-screen support
icon.svg                 app icon
.nojekyll                tells GitHub Pages to serve files as-is
.github/workflows/       builds the feed and deploys the site
```
