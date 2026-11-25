# aldercote.online

The Alder Cote site. Plain HTML, no build step.

- `public/` is the whole site: `index.html` (home), `songs.html` (song index), one page per song, plus the images, videos and `site.js`.
- `src/worker.js` only handles videos (`*.mp4`): it answers Range requests so they play in Safari and on iPhones. Everything else is served straight from `public/`.
- Every push to `main` deploys automatically through Cloudflare.

## Cloudflare settings

**Worker** (the default for new projects): `wrangler.jsonc` handles everything. The Worker's name must be `alder-cote-site` (or change `name` in `wrangler.jsonc` to match). Deploy command: `npx wrangler deploy`, build command empty, root directory `/`.


Custom domain: Worker → Settings → Domains & Routes → Add → Custom domain → `aldercote.online`.
