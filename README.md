# Linework

Draw something in black ink. Linework reads the linework (what it looks like and how it was drawn) and finds a release on Spotify to match.

A static site: no build step, no server, no dependencies. It runs from GitHub Pages as-is.

## How a drawing becomes a record

1. **Content (the motif).** Each stroke is classified (circle, spiral, star, zigzag, wave, peak, line, box, heart, crescent, almond, cloud, flower, bird, arrow, scribble, dot…), then the whole drawing is read as one of 27 motifs: a face, sun, circle, spiral, star, grid, rainfall, field of dots, zigzag, peak, wave, loops, horizon, single line, scribble, heart, house, flower, crescent moon, eye, cross, box, arrow, stick figure, bird, cloud, or an abstraction. The motif picks the search keyword, e.g. a spiral searches for *spiral*, *vertigo*, *galaxy*, *hypnotic*.
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

How matching works: an exact motif match counts most, a related motif (a sun drawing → a "moon" record) a little, and among those the record whose genre profile is closest to the drawing's linework wins. The pick is deterministic, so the same drawing always gives the same record.

### The included catalogs

- `catalog.json` (live): 1,820 releases from the *Lovers Rock* playlist, built from a CSV export.
- `catalog-reflecting.json` (spare): 635 releases from the *Reflecting* playlist. To use it, rename it to `catalog.json`.

Genres were assigned by hand from the artists. Records whose genre is a low-confidence guess carry `"genreGuess": true`; in the builder, the **Unsure genre** filter lists them for checking. Rebuilding from the playlist in the builder keeps these genres for any artist MusicBrainz has no tags for.

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
.github/workflows/       optional Pages deploy action
```
