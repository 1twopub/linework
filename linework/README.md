# Linework

Draw something in black ink. Linework reads the linework — what it looks like and how it was drawn — and finds a release on Spotify to match.

A static site: no build step, no server, no dependencies. It runs from GitHub Pages as-is.

## How a drawing becomes a record

1. **Content (the motif).** Each stroke is classified (circle, spiral, star, zigzag, wave, peak, line, scribble, dot…), then the whole drawing is read as a motif: a face, a sun, rain, a grid, a horizon, a field of dots, and so on. The motif picks the search keyword, e.g. a spiral searches for *spiral*, *vertigo*, *galaxy*, *hypnotic*.
2. **Linework (the character).** Seven measurements, each 0–1:
   speed of drawing, angularity (corners), curvature, ink density, chaos (strokes, jitter, crossings), lift (how high on the page), and symmetry.
   These are matched against profiles for 36 genres (jagged + fast + dense → punk or metal; slow, flowing, sparse → ambient or bossa nova) and choose an era.
3. **Search.** Linework searches Spotify for tracks matching the keyword, genre and decade, and loosens the search step by step if nothing comes back. The release is the album the matching track belongs to.
4. **Deterministic.** The same drawing always gives the same record; a slightly different one usually gives a different record.

All of this is in `js/analyze.js` (drawing analysis) and `js/mapping.js` (keywords, genre profiles, search plan). Edit the word lists and genre profiles there to change the personality.

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
js/app.js                canvas, screens, settings
js/analyze.js            stroke geometry, motif detection, linework features
js/mapping.js            motif keywords, genre profiles, search plan
js/spotify.js            PKCE login, token refresh, search
manifest.webmanifest     add-to-home-screen support
icon.svg                 app icon
.nojekyll                tells GitHub Pages to serve files as-is
.github/workflows/       optional Pages deploy action
```
