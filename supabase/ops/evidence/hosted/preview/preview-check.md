# preview-check — 2026-10-04T15:18Z — https://crystal-clues-5krthqdtt-showvideogames-2326s-projects.vercel.app

PASS  home loads (200, has #root)  — HTTP 200
PASS  /auth/callback is served by the app (SPA rewrite)  — HTTP 200
PASS  bundle found  — 568178 bytes
PASS  bundle points at the hosted project
PASS  bundle carries the Staging discovery URL (accounts ON)
PASS  bundle names no Production AuthKit domain
PASS  bundle names no local address
PASS  content counts: 55 puzzles / 1080 words  — 55 / 1080
PASS  today's puzzle query (the live client's) answers  — [{"id":1790996707216,"title":"Deb 10"}]
PASS  anon cannot write content  — HTTP 401
PASS  anon cannot delete content  — HTTP 401
PASS  anon cannot call ensure_account  — HTTP 401
PASS  anon cannot call my_account  — HTTP 401
PASS  anon cannot call record_play  — HTTP 401
PASS  anon cannot call import_plays  — HTTP 401
PASS  anon cannot call delete_my_account  — HTTP 401
PASS  ping answers true
PASS  anon cannot read plays  — HTTP 401
PASS  anon cannot read accounts  — HTTP 401
PASS  hosted authorize redirects to the Staging AuthKit domain with PKCE  — HTTP 302 → https://detailed-pink-69-staging.authkit.app/oauth2/authorize?client_id=<id>&code_challenge=ui-ikodJ
PASS  authorize carries the preview's callback as redirect_to

21/21 checks passed
