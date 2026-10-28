# Candidates for native free Worker adapters

Checked on 2026-10-26. Eneyida, KinoVezha and UASerials are now native adapters.
UFDub was added in v0.3.11 after Cloudflare and Lampa playback checks. Other
entries remain research candidates, not enabled providers.

## Recheck on 2026-10-27 for v0.3.15

Kinobase, HDVB and UAFlix were checked again from a temporary Cloudflare Worker. None passed direct-video availability: Kinobase exposed no ready playlist; the guest HDVB API returned 404; UAFlix exposed real catalog iframes but all three inspected Zetvideo players returned a 155-character HTML 404 document with HTTP 200. These later results supersede earlier candidate availability notes; no new balancer is enabled. Full request paths, limits and primary references: [v0.3.15 audit](comfort-0315.md#13-перевірка-кандидатів-у-джерела).

## Serialno — implemented and verified in v0.3.12

- Public catalog: <https://serialno.tv/>. Search uses the normal DLE form and
  semantic `.th-item` cards. The known series is
  <https://serialno.tv/1515-zzovni.html>, From (2022).
- Only published main playback tabs are inspected. Its first player is
  `https://tortuga.tw/embed/1516`; the Ashdi tab and same-host trailer are excluded.
  Scripts are parsed as data, not executed.
- From Cloudflare, the unavailable public Tortuga document can use the existing
  identity-checked `hdvbua.pro/embd/1516` archive alias. An ID is insufficient:
  each media filename must independently identify `From`. CAPTCHA, 403/429 or
  authentication failures do not trigger this lookup. The resulting inventory
  has 45 episode/voice entries across four seasons in this check; it can differ
  from the original player's inventory.
- Real Lampa/Chromium playback passed for season 1 episodes 1 and 2 at 1920×960,
  3,155.319 and 2,966.923 seconds duration. Native next-episode navigation
  preserved HDrezka Studio; only the two chosen manifests were resolved.
- The catalog shares video infrastructure with existing sources. It is not
  described as an independent CDN backup. Mirror studio names do not imply
  Ukrainian audio; the adapter does not stamp every mirrored voice as `uk`.
- Full original title/year/type are rechecked before player lookup. When search
  cards omit original titles, at most four same-year pages are inspected for
  metadata only. A movie card skips this series-only provider without a request.
- AniLibria was removed from the client menus and searches at the user's request;
  no AniTube adapter is added. The old AniLibria server API remains for compatibility.
- Live check: `npm run smoke:serialno`. Primary provider reference:
  <https://github.com/CakesTwix/cloudstream-extensions-uk/blob/master/SerialnoProvider/src/main/kotlin/com/lagradost/SerialnoProvider.kt>.

## Additional candidates checked on 2026-10-27

These checks use normal public catalog/player requests. Neither candidate was
enabled in v0.3.10. The full v0.3.11 checks below supersede the initial partial
media probes: UAFlix is deferred and UFDub is implemented. Playback on Chromium
does not establish compatibility with every TV.

### UAFlix — deferred after full catalog access check

The initial manifest/segment probes below were insufficient. A real catalog
request from Cloudflare later returned only a YouTube trailer and a generic
message suggesting authentication or a country change. That message alone
does not identify whether the cause is location, server IP, or session state;
the exact reason for the differing player response remains unconfirmed. The adapter prototype
was not published. No SEO iframe fallback, region change, fingerprint script
execution or authorization bypass is used to work around that message.

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
- A native adapter remains deferred until the catalog is normally accessible.
- Primary adapter reference:
  <https://github.com/CakesTwix/cloudstream-extensions-uk/blob/master/UAFlixProvider/src/main/kotlin/com/lagradost/UAFlixProvider.kt>.

### UFDub — implemented, separate public video infrastructure

- Current site: <https://ufdub.com/>. The inspected page
  <https://ufdub.com/anime/454-rokuhoudou-yotsuiro-biyori.html> publishes a
  `video.ufdub.com` player with numbered episode links.
- Its public `ufdub.com/video/VIDEOS.php` episode endpoint redirects to a
  published MP4 on `api.ufdub.com`. From Cloudflare, a byte-range request to that
  media returns HTTP 206 and 1,024 bytes, with `application/octet-stream` and
  no Access-Control-Allow-Origin header. Lampa's default `crossorigin=anonymous`
  prevented playback. For owned UFDub MP4s only, the player uses normal HTML5
  media embedding without that attribute. Video bytes are never proxied.
- Real Lampa/Chromium playback passed for
  <https://ufdub.com/film/426-nebesni-stvorinnia.html>: 1920×1080, 6,535.349 s,
  including seeking to 60 s. The public guest playlist for project 454 has five
  episodes; episodes 1 and 2 played at 1920×1080, 1,412.096 and 1,411.264 s.
  Automatic next-episode selection preserves the voice; closing a pending
  later episode prevents delayed playback. See `scripts/smoke-ufdub.mjs`.
- One public MP4 is published per episode. Its quality is `Авто`; selectable
  720p/1080p/2160p variants are not fabricated. `web` entries, trailers and
  video requiring a separate audio file are excluded.
- The Location header's UTF-8 filename is handled on Node and Workers, with
  the redirect restricted to `https://api.ufdub.com/UFDUB_UPLOAD/VIDEO/*.mp4`.
  Only the main guest `V2/VP.php` iframe is read. Alternate embed examples,
  patron-only inventory, executable scripts and guessed episode URLs are not used.
- Exact page title/year/type checks precede player resolution. Large series
  use three requests when opened; later selected episodes use one redirect.
  Lazy descriptors are separate from playable media URLs and share a delivery
  family with the UFDub CDN for backup filtering.
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
