// Your Spotify app's Client ID (from https://developer.spotify.com/dashboard).
// It is public by design (PKCE needs no secret), so it is safe to commit.
// Leave it empty to let each visitor paste their own Client ID in the app's settings.
export const CLIENT_ID = '';

// Anonymous posting to the feed (see README → "The feed").
// POST_URL: your Cloudflare Worker's address, e.g. 'https://linework-relay.yourname.workers.dev'.
// Leave empty to hide the Post button (the feed page still shows existing posts).
export const POST_URL = 'https://lineworker.ezekielpaints.workers.dev';
// Optional Cloudflare Turnstile site key. Set it together with TURNSTILE_SECRET on the Worker.
export const TURNSTILE_SITEKEY = '';
