# Candidates for native free Worker adapters

Checked on 2026-10-26. Eneyida, KinoVezha and UASerials are now native adapters.
Other entries remain research candidates, not enabled providers.
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

## Deferred candidates

- **UAKino:** current reference implementations name `uakino.best` and
  `uakino.top`. Direct curl checks returned HTTP 404 and 403 respectively.
  Open adapter source exists, but current runtime access is unconfirmed:
  <https://github.com/lampame/lampac-ukraine/blob/main/LME.UAKino/UAKinoInvoke.cs>.
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
4. Revisit UAKino/UAFilm only if ordinary public access works.

For every provider, show only qualities actually advertised by its media
playlist. These checks do not establish free 2160p availability.
