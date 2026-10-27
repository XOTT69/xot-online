# Candidates for native free Worker adapters

Checked on 2026-10-26. Eneyida, KinoVezha and UASerials are now native adapters.
Other entries remain research candidates, not enabled providers.

## Additional candidates checked on 2026-10-27

These checks use normal public catalog/player requests. Neither candidate is
enabled in v0.3.10. Site access, a manifest and partial media access do not yet
establish a finished Lampa adapter or compatibility with every TV.

### UAFlix — promising next catalog

- Current site: <https://uafix.net/>. The public movie page
  <https://uafix.net/films/protu-yragany/> publishes both a Zetvideo player and
  an Ashdi player. The inspected alternative is the published Zetvideo player,
  not an alternate address for a blocked Ashdi request.
- <https://zetvideo.net/vod/69920> supplies a public HLS master with actual
  1920×804, 1280×536 and 854×356 variants (1080p/720p/480p). The inspected
  media playlist declares approximately 5,866.58 seconds and EXT-X-ENDLIST.
- From a temporary Cloudflare Worker, the catalog page, master and variant
  playlist return HTTP 200. The HLS master exposes CORS `*`. Its media segments
  use the published CDN `video.zetvideo.net`.
- A byte-range request to that published segment from Cloudflare returns
  HTTP 206, `video/mp2t`, CORS `*` and 1,024 bytes. No region change, authentication
  or challenge bypass is involved. This remains partial-media validation, not
  a complete Lampa playback test.
- A native adapter still needs exact movie identity checks, current search and
  episode parsing, voice preservation and actual Lampa playback validation.
- Primary adapter reference:
  <https://github.com/CakesTwix/cloudstream-extensions-uk/blob/master/UAFlixProvider/src/main/kotlin/com/lagradost/UAFlixProvider.kt>.

### UFDub — separate public video infrastructure

- Current site: <https://ufdub.com/>. The inspected page
  <https://ufdub.com/anime/454-rokuhoudou-yotsuiro-biyori.html> publishes a
  `video.ufdub.com` player with numbered episode links.
- Its public `ufdub.com/video/VIDEOS.php` episode endpoint redirects to a
  published MP4 on `api.ufdub.com`. From Cloudflare, a byte-range request to that
  media returns HTTP 206 and 1,024 bytes, with `application/octet-stream` and
  no Access-Control-Allow-Origin header. Native MP4 playback and seeking in
  Lampa still need to be tested; no quality tier is claimed from the filename.
- The Location header may contain a non-ASCII filename. A future adapter must
  handle the redirect encoding correctly and restrict it to the known media
  host rather than forwarding arbitrary URLs.
- Primary adapter reference:
  <https://github.com/CakesTwix/cloudstream-extensions-uk/blob/master/UFDubProvider/src/main/kotlin/com/lagradost/UFDubProvider.kt>.

### Candidates not selected as Ashdi replacements

- <https://cikava-ideya.top/70-resident-alien.html> publishes episode players on
  Ashdi in its public Player1 data.
- <https://kinotron.tv/149-simpsony-ukrainskoyu-onlain.html> likewise publishes
  an Ashdi serial player.
- These are different catalogs, but the checked examples do not provide a
  different video host for this Worker. Other titles or future site changes
  would need another independent check.
The original checks below ran from the development machine. Eneyida subsequently
passed Cloudflare Worker search/post checks and actual Lampa/Chromium playback:
the 2021 Resident Evil film at 720p (1280 pixels wide) and 1080p (1920 pixels wide),
6,447 seconds duration, plus Tulsa King season 2 episode 1. Its series inventory
returned 31 episode/voice entries over four seasons and two voice labels; only
the selected episode's video manifest was resolved. See `scripts/smoke-public-players.mjs`.

## Eneyida — implemented and verified

- Site: <https://eneyida.tv/>
- Public search: POST `/` with `do=search`, `subaction=search`, `story`.
- Search found the correct 2021 film, not just another Resident Evil title:
  <https://eneyida.tv/6785-oselia-zla-vitaiemo-v-rakkun-siti.html>.
- Its main iframe was `https://hdvbua.pro/vid/72599`, separate from the trailer.
- The public player supplied an HTTPS HLS master. Advertised variants were
  1920x794, 1280x528, and 854x352, conventionally 1080p/720p/480p with cropped
  cinema aspect ratio. No 2160p variant was present for this film.
- The 1080 variant contained 1,289 segments, `EXT-X-ENDLIST`, and 6,447.44 seconds
  of declared media duration. No `EXT-X-KEY` was present.
- A request without Referer, using the Lampa origin, returned the variant with
  HTTP 200 and `Access-Control-Allow-Origin: *`. The first 1,024 bytes of its
  first segment returned HTTP 206, `video/mp2t`, CORS `*`, and MPEG-TS sync byte.
- This verifies playlist and segment access, not a complete playback session.
- Reference implementation:
  <https://github.com/CakesTwix/cloudstream-extensions-uk/blob/master/EneyidaProvider/src/main/kotlin/com/lagradost/EneyidaProvider.kt>

## KinoVezha — implemented, overlapping media

- Site: <https://kinovezha.tv/>
- Public search: POST `/` with the same DLE search form.
- Correct film: <https://kinovezha.tv/1893-oselya-zla-vitayemo-v-rakkun-siti.html>.
- Main iframe: `https://tortuga.tw/vod/72599`, separate from the trailer.
- Its public player configuration supplies an encoded HLS URL; no login or
  challenge bypass was used to inspect it. Generated stream URLs are temporary
  and are deliberately not recorded here.
- The master advertised the same three resolutions and bitrates as Eneyida.
  The 1080 variant likewise declared 1,289 segments and 6,447.44 seconds, with
  no encryption tag. Its playlist and first segment passed the same CORS and
  byte checks described above.
- Different player domains are not proof of independent media infrastructure.
  The matching player ID and media characteristics suggest overlapping media;
  do not describe this as a guaranteed independent fallback.
- Reference implementation:
  <https://github.com/CakesTwix/cloudstream-extensions-uk/blob/master/KinoVezhaProvider/src/main/kotlin/com/lagradost/KinoVezhaProvider.kt>

## UASerials — implemented, overlapping media

- Site: <https://uaserials.com/>
- Public GET `/search/{encoded query}/` returned the correct film:
  <https://uaserials.com/5861-oselya-zla-vitayemo-v-rakkun-siti.html>.
- The current movie page uses a `player-control` web component with an encoded
  configuration, rather than a plain iframe. An existing provider implementation
  is useful context, but its behavior must be checked against this current page.
- The current public tab format is decoded as data using WebCrypto PBKDF2 and
  AES-CBC; no page scripts are executed. The primary Tortuga page returns an
  HTML 404 to Cloudflare, so the public archive alias below is used if verified.
- Reference implementation:
  <https://github.com/CakesTwix/cloudstream-extensions-uk/blob/master/UASerialsProProvider/src/main/kotlin/com/lagradost/UASerialsProProvider.kt>

## Cloudflare and Lampa validation of the added catalogs

- KinoVezha and UASerials both passed real Lampa/Chromium playback of the 2021
  Resident Evil film at 720p (1280 pixels wide) and 1080p (1920 pixels wide), with
  approximately 6,447 seconds of media duration.
- KinoVezha returned 62 verified episode entries over five seasons of Breaking Bad;
  season 2 episode 1 played with 720p/480p available.
- UASerials returned 29 verified episode entries over three seasons of Tulsa King;
  season 2 episode 1 played with 1080p/720p/480p available.
- Both catalogs use Tortuga public player IDs. Those player pages currently return
  a short HTML 404 document with status 200 to Cloudflare, despite returning player
  data to the development machine. The adapter can try the public HDVB UA archive
  alias only for numeric `vod/vid` and `embed/embd` paths. The ID alone is not enough:
  the full original title, and movie year when applicable, must also match the
  readable HLS media filename. Opaque/mismatching alternate media is omitted.
- Primary 403/429 responses and challenges do not trigger that alternate lookup.
- This is shared video infrastructure with independent catalog searches, not three
  guaranteed independent video hosts. Catalog and verified mirror inventories
  may differ. Only confirmed alternate media is returned.
- The browser test also verifies the separate header voice control for series and
  that only the selected episode's video manifest is requested.

## Archived UAKino audit (v0.3.6–0.3.7; removed in v0.3.10)

UAKino/Ashdi was removed at the user's request in v0.3.10. It is absent from the
balancer picker, aggregate and backup searches, API registry and native Worker
routes. The implementation and its provider-specific tests were removed; Git
history retains the earlier work. The observations below describe that earlier
audit, not an available current adapter.

The user also confirmed the same regional error on Django Unchained after the
brief v0.3.9 restoration. v0.3.10 removes that test adapter again.

The current public catalog is <https://uakino.eu/>, rather than the older
`uakino.best` / `uakino.top` addresses. Its public search and exact movie identity
work from the Worker. The new native adapter reads only the Ashdi tab; trailers
and the access-protected UACDN tab are excluded.

The site's own public series implementation is
<https://uakino.eu/templates/uakino/ilyaugly/ashdi-smart/smart-player.js?v=3.4.4>.
It posts to `/index.php?controller=ajax&mod=smart_playlist`. The returned published
Ashdi serial page contains multiple voices and seasons without requesting all
individual media playlists. Local public inspection of Tulsa King yielded 62
entries across DniproFilm, Kyivstar and Uaflix. The movie master advertised actual
480p/720p/1080p variants.

**Cloudflare verification failed for playback:** Ashdi returns HTTP 200 containing
“Змініть країну перегляду” / “Плеєр недоступний для перегляду в цій країні”.
This is `uakino_region_restricted`, not a parser failure or a successful empty
search. No alternate IP, relay, protected player or region bypass is attempted.
Lampa shows the restriction; aggregate and backup results contain no fake streams.
This source is implemented but is **not a verified working Worker balancer**.

A normal request through the production Worker was repeated for v0.3.7 and still
returned `uakino_region_restricted`. The same UAKino page publishes only Ashdi,
UACDN and its trailer. Its alternative UACDN page explicitly sets
`captcha_required: true` and does not publish video files before that check.
Neither player is presented as an available aggregate result. Individual UAKino
selection retains the regional restriction message. No hosting change was made.

## Deferred candidates

- **UAFilm:** requests to the public JSON search route at
  `https://uafilm.me/api/v1/search/{query}` redirected to `/cdn-cgi/content`.
  No challenge bypass was attempted. Do not enable based on route documentation.
- **Gidonline / HDVB / Cinemar:** catalog-level access was previously observed;
  direct playback and suitability for this Worker remain unverified. A source
  name appearing in Lumio is not evidence that its server adapter can run here.

## Suggested order

1. Eneyida: implemented search, exact movie matching, separate trailer exclusion,
   voices/episodes, and direct HLS playback; verified on a Cloudflare Worker.
2. KinoVezha: implemented and verified film/series playback from Cloudflare.
3. UASerials: implemented current tab decoding and verified film/series playback.
4. Revisit UAFilm only if ordinary public access works.

For every provider, show only qualities actually advertised by its media
playlist. These checks do not establish free 2160p availability.
