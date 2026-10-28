# Безкоштовний хостинг адаптера Rezka

Перевірено документацію 28.10.2026. Це кандидати для перевірки мережевого
доступу, а не підтверджені робочі підключення Rezka. Vercel розгорнуто
користувачем і перевірено: [відео не повертається](rezka-vercel-2026-10-28.md).
Render ще не розгорнуто; production Worker не переналаштовано.

## Кандидати

| Варіант | Безкоштовні умови | Практична межа |
| --- | --- | --- |
| [Render Free](https://render.com/docs/free) | 750 годин на workspace за місяць, Node web service, HTTPS | Засинає після 15 хвилин без запитів; пробудження близько хвилини. Без платіжного методу перевищення включених bandwidth/build лімітів призводить до зупинки відповідних сервісів/збірок. |
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | Безкоштовно для особистого некомерційного використання | Потрібен окремий entrypoint функції; доступ до Rezka треба перевіряти на розгорнутій функції. |
| [Deno Deploy Free](https://deno.com/deploy/pricing) | $0, 1 млн вхідних запитів і 20 GiB вихідного трафіку на місяць | Потрібна перевірка runtime/entrypoint та доступу до Rezka з deployment. |

Render підготовлено як перший кандидат через сумісність із Node backend.
Після вибору користувачем Vercel також підготовлено [окрему функцію й сторінку
діагностики Vercel](vercel-rezka.md); виконано фактичну перевірку без успішного відео.
Відеофайли через нього не передаються: адаптер отримує метадані й адреси потоків.
Зміна хостингу не гарантує усунення обмеження стороннього джерела.

[Koyeb](https://www.koyeb.com/docs/faqs/pricing) має free instance, але вимагає
картку; перевірка картки включає тимчасове блокування $29, а вибраний план
може оплачуватися окремо. Тому це не перший варіант для запиту без витрат.
[Railway](https://docs.railway.com/pricing/free-trial) після trial дає $1/місяць,
що не є гарантією безкоштовного постійного сервера.

## Підготовлений Render

У корені є `render.yaml`: один web service з явним `plan: free`, Node 22,
канонічним origin, випадковим серверним секретом і `/healthz`. Бази даних,
диски, платні інстанси та автоматичні деплої не додаються.

1. Увійти в Render через GitHub і відкрити [створення Blueprint](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FXOTT69%2Fxot-online%2Ftree%2Fcodex%2Fdirect-balancer-launch).
2. Перевірити, що створюється лише `xot-rezka-test` із планом **Free**. Якщо
   акаунт вимагає оплату або платіжну верифікацію, не продовжувати автоматично.
3. Після запуску відкрити `https://АДРЕСА.onrender.com/healthz`. `{"ok":true}`
   підтверджує лише роботу Node, не доступ до Rezka.
4. У Render Environment згенерований `XOT_SERVER_TOKEN` залишається приватним.
   Не передавати його в чат, Git чи URL. Для ручної перевірки задати локально
   `XOT_TEST_BACKEND_URL` та `XOT_TEST_SERVER_TOKEN` і виконати приклад нижче.

```bash
curl --silent --show-error --max-time 120 \
  "$XOT_TEST_BACKEND_URL/api/rezka" \
  --header "Authorization: Bearer $XOT_TEST_SERVER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"action":"post","path":"/films/action/47946-top-gan-meverik-2022-latest.html","movie":{"titles":["Top Gun: Maverick","Топ Ган: Мэверик"],"year":2022,"series":false}}'
```

Це перевіряє сторінку й озвучення. Після успіху потрібно окремо перевірити
`stream`, список серій, запуск фільму й епізоду в Lampa, перемотування та
перехід до наступної серії. Сам пошук або HTTP 200 не є доказом відтворення.
При повторному обмеженні доступу кандидат позначається непідтвердженим.

## Перед підключенням до плагіна

Production поки не змінювати. Наявний міст `XOT_BACKEND_URL` передає на backend
і Filmix, і Rezka та має тайм-аут 22 секунди. Перед використанням Render треба
відокремити маршрут Rezka й опрацювати тривале пробудження в UI з можливістю
скасування; просте виставлення цієї змінної погіршить чинний Filmix і не
вмістить холодний запуск Render у тайм-аут клієнта.

Публічний `m.js` може залишитися за чинною адресою Cloudflare: виконання
адаптера Rezka при цьому буде на Render. Ноутбук не потрібен. Для повної
відмови від Cloudflare окремо потрібне розгортання статичних файлів та інших
API; для перевірки Rezka це зайве.

Джерела конфігурації: [Blueprint spec](https://render.com/docs/blueprint-spec),
[Deploy button і гілки](https://render.com/docs/deploy-to-render),
[Node version](https://render.com/docs/node-version).
