# Публикация FORMA: Cloudflare Workers + D1 + Google

Схема: браузер → Cloudflare Worker (API и вход через Google) → база Cloudflare D1. HTML, CSS, JS и шрифты Cloudflare раздаёт как статику со своей сети. Сервер не засыпает: Worker запускается за миллисекунды на каждый запрос, поэтому первой загрузки «после простоя» нет.

Бесплатного тарифа Workers хватает для портфолио: 100 000 запросов в день, D1 — 5 ГБ и 5 млн чтений строк в день. Актуальные лимиты: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/).

## 1. Аккаунт и база

Нужны Node.js 22+ и бесплатный аккаунт Cloudflare.

```sh
npm install
npx wrangler login
npx wrangler d1 create forma
```

Команда `d1 create` выведет `database_id`. Разрешите wrangler дописать его в `wrangler.jsonc` или вставьте вручную в блок `d1_databases`. Затем создайте таблицы и демокомпании:

```sh
npm run db:migrate
```

Миграции лежат в `migrations/`. Новая схема — новый файл `0003_...sql`, старые файлы не меняются.

## 2. Публикация

```sh
npm run deploy
```

Wrangler напечатает адрес вида `https://forma.<ваш-поддомен>.workers.dev`. Каталог, запись и демокабинет работают сразу.

Автопубликация из GitHub: Cloudflare Dashboard → Workers & Pages → forma → Settings → Build → подключите репозиторий. Build command — `npm ci`, Deploy command — `npx wrangler d1 migrations apply forma --remote && npx wrangler deploy`.

Свой домен: Worker → Settings → Domains & Routes → Add custom domain.

## 3. Вход через Google

В Google Cloud / Google Auth Platform создайте OAuth client типа Web application (Branding: имя FORMA и email поддержки; Audience: External). Разрешённые redirect URI:

```text
http://localhost:8787/login/oauth2/code/google
https://forma.<ваш-поддомен>.workers.dev/login/oauth2/code/google
```

Ключи храните только в секретах Cloudflare:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

`BASE_URL` задавать не нужно: адрес берётся из запроса. Задайте его (`npx wrangler secret put BASE_URL`, без слеша в конце), только если сайт открывается по нескольким доменам, а в Google зарегистрирован один.

Запрашиваются только `openid profile email`. Пока приложение в режиме Testing, добавьте свои аккаунты в Test users.

## 4. Локальный запуск

```sh
npm install
npm run dev        # http://localhost:8787, локальная копия D1 в .wrangler/
npm test           # тесты API в настоящем рантайме Workers
npm run typecheck
```

Для проверки Google-входа локально скопируйте `.dev.vars.example` в `.dev.vars` и заполните ключи.

## 5. Проверка после деплоя

1. Откройте публичный адрес и демокабинет `/demo`.
2. Войдите через Google и создайте компанию в `/dashboard`.
3. Добавьте услугу и специалиста, настройте часы и дни работы.
4. Откройте `/studio/<slug>` в другом браузере, запишитесь и найдите запись в кабинете владельца.
5. Два запроса на пересекающееся время одного специалиста: проходит только один.
6. Аккаунт другой компании не видит ваши записи.

## Как устроена защита

- Сессия — случайный токен в HttpOnly-cookie; в D1 хранится только его SHA-256. Срок — 7 дней, «Выйти» удаляет сессию на сервере.
- CSRF: токен из `/api/session` сверяется с cookie для всех POST/PUT/DELETE, запросы с чужим `Origin` отклоняются.
- Google OIDC: `state` и `nonce` в короткой cookie, проверка `iss`, `aud`, `exp` и `nonce` у ID-токена.
- Двойная запись невозможна: проверка пересечения, активности мастера и услуги и часов работы выполняется в той же SQL-команде, что и вставка, а D1 выполняет её атомарно.
- Лимит: 30 попыток записи за 10 минут с одного IP (`CF-Connecting-IP`), счётчики в D1.
- Заголовки CSP, `X-Frame-Options`, `Referrer-Policy` для статики (`public/_headers`) и API.
- Раз в сутки cron удаляет истёкшие сессии и старые счётчики лимита.

## Ограничения концепта

- Это рабочий прототип для портфолио, не production-сервис для реальных клиентов.
- Нет SMS/email, платежей, синхронизации с внешним календарём, смен/перерывов и привязки услуг к отдельным мастерам. Каждый активный специалист компании доступен для каждой её услуги.
- Часовой пояс всех компаний — Europe/Tallinn; длительности и слоты кратны 30 минутам, горизонт записи 60 дней.
- Смена рабочих часов влияет на новые слоты; ранее созданные записи остаются в расписании.
- Удаление услуги/специалиста — архивирование, история записей сохраняется.
- Отмену выполняет владелец компании. Клиент видит свои записи, только если входил при бронировании.
- Нет самостоятельного удаления аккаунта, согласованных сроков хранения и процесса обработки запросов на удаление. До настоящего запуска это нужно определить и отразить в privacy policy.
