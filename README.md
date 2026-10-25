# XOT Online — ХОТ для Lampa

Стартовий плагін Lampa з кнопкою **ХОТ**, Cloudflare Workers API і реєстром незалежних адаптерів.

**Поточний стан:** перше джерело Internet Archive інтегровано. Пошук — за збігом назви, а відтворення — лише для доступних MP4/WebM/M4V-файлів. Не кожен фільм є в Archive; права на окремі матеріали потрібно перевіряти. Filmix/Rezka наразі не підключені.

## Структура

- `public/m.js` — завантажувач, використовуй цю URL в Lampa.
- `public/online.js` — UI Lampa з кнопкою «ХОТ».
- `m.js` / `online.js` — вихідні копії (зміни потрібно синхронізувати з `public/`).
- `worker/index.js` — API: `/api/health`, `/api/providers`, `/api/search`.
- `worker/providers.js` — реєстр адаптерів з Internet Archive.
- `tests/` — API-тести.

## Встановлення та деплой

Потрібні Node.js 20+, npm, Cloudflare account.

```bash
npm install
npm test
npx wrangler login
npm run deploy
```

Cloudflare надасть адресу схожу на `https://xot-online.<your-subdomain>.workers.dev`.
Додай у Lampa через налаштування плагінів:

```
https://xot-online.<your-subdomain>.workers.dev/m.js
```

Не підставляй буквально `<your-subdomain>` — адреса з'явиться після деплою.

Перевір API `https://xot-online.<your-subdomain>.workers.dev/api/health`.

## API

| Route | Результат |
| --- | --- |
| `GET /api/health` | Стан сервісу й кількість джерел |
| `GET /api/providers` | Реєстр джерел |
| `GET /api/search?title=...&tmdb_id=...&year=...` | Узгоджені результати та статус кожного адаптера |

## Далі

1. Перевірити UI та сумісність кнопки з встановленою версією Lampa.
2. Додати один законно доступний, документований API-провайдер.
3. Додати окремі авторизовані інтеграції з озвученнями, сезонами та серіями. Для Archive вибір реального файлу вже реалізований.
4. Додати кеш, telemetry з урахуванням приватності, rate limit та тестування на TV.

Секретні ключі зберігай у Cloudflare Workers Secrets, не у JS клієнта. Немає підтримки обходу DRM чи закритої авторизації.

## Після змін у GitHub

Зробіть новий деплой у Cloudflare (автодеплой за підключеним GitHub або `npm run deploy`). Перевірте `/api/health`: очікується `provider_count: 1`. Натисніть **ХОТ** у картці відповідного відео. Якщо метадані Archive не містять сумісного відео, плагін чесно повідомить про відсутність варіантів. Кнопка в Lampa не означає, що джерело гарантує відтворення.

<!-- Trigger Cloudflare Git integration build for provider update (2026-10-25). -->
