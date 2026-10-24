# Публикация FORMA: Render + Supabase + Google

Схема: браузер → Java/Spring Boot на Render → PostgreSQL в Supabase. Вход — Google OpenID Connect через Spring Security. Supabase Auth в этой архитектуре не нужен.

## 1. Supabase

Создайте бесплатный проект. Для приложения используйте отдельную схему `forma`, которая не включена в Exposed schemas Data API. Не размещайте таблицы клиентов в открытой схеме `public`.

Миграция закрытой схемы без учётных данных находится в `deploy/supabase/001_private_schema.sql`. RLS на этих таблицах пока выключен: доступ ограничен правами схемы и таблиц, а принадлежность компаний проверяет Java. Не выдавайте `anon` и `authenticated` права на эту схему.

Для нового размещения в SQL Editor создайте отдельного пользователя и схему (пароль придумайте самостоятельно и не сохраняйте в Git):

```sql
CREATE ROLE forma_app LOGIN PASSWORD 'REPLACE_WITH_A_STRONG_UNIQUE_PASSWORD';
CREATE SCHEMA forma AUTHORIZATION forma_app;
GRANT USAGE ON SCHEMA forma TO forma_app;
```

В Connect → Session pooler скопируйте host и port 5432. Подключение:

```text
DATABASE_URL=jdbc:postgresql://POOLER_HOST:5432/postgres?sslmode=require&currentSchema=forma
DATABASE_USER=forma_app.PROJECT_REF
DATABASE_PASSWORD=<password above>
```

Имена host/project reference берите из своего проекта. Для первого старта пользователь владеет схемой и может создать таблицы. Приложение не использует Supabase anon/service-role API keys, браузер не получает пароль БД. Не добавляйте `forma` в API exposed schemas. Политики владельцев компаний проверяет Java-сервер. Для настоящего production стоит отделить миграционного пользователя от runtime-роли и добавить RLS как дополнительную защиту.

Документация: [подключения Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [pooler](https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO).

## 2. Render

Подключите GitHub-репозиторий и создайте Web Service → Docker → Free, либо Blueprint из `render.yaml`. Это существующие конфигурации проекта, frontend собирается вместе с сервером. Заполняйте секреты только в Render Environment.

```text
SPRING_PROFILES_ACTIVE=prod
BASE_URL=https://YOUR-SERVICE.onrender.com
DATABASE_URL=<JDBC URL from step 1>
DATABASE_USER=<user from step 1>
DATABASE_PASSWORD=<password from step 1>
GOOGLE_CLIENT_ID=<from step 3>
GOOGLE_CLIENT_SECRET=<from step 3>
```

`BASE_URL` — без завершающего слеша. PORT задаёт Render. Health check: `/api/companies`. База H2 годится только локально: на Render файловая система временная. Production-профиль требует внешнюю БД.

Если Google пока не настроен, оставьте обе переменные GOOGLE пустыми: каталог, запись и read-only демокабинет работают; вход честно обозначен как недоступный.

Бесплатный Render останавливает неактивные web services после 15 минут; первый запрос после простоя может быть медленным. Проверьте актуальные квоты перед публикацией: [Render Free](https://render.com/docs/free).

## 3. Google OAuth

В Google Cloud / Google Auth Platform создайте проект, настройте Branding (имя FORMA, email поддержки), Audience (External), и OAuth client типа Web application. Настройку согласия и Terms при создании аккаунтов выполняет владелец.

Разрешённые redirect URI:

```text
http://localhost:8080/login/oauth2/code/google
https://YOUR-SERVICE.onrender.com/login/oauth2/code/google
```

Ключи Client ID и Client secret перенесите в серверные environment variables. Не публикуйте Client secret и не вставляйте его в JS. Запрашиваются только `openid profile email`; доступ к Gmail/контактам/календарю не нужен. Пока приложение в Google Testing, добавьте свои аккаунты в Test users; для общего доступа настройте аудиторию/публикацию в соответствии с требованиями Google.

[Официальный Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Spring Security OAuth2](https://spring.io/guides/tutorials/spring-boot-oauth2/).

## 4. Проверка после деплоя

1. Откройте публичный адрес и демокабинет `/demo`.
2. Войдите через Google и создайте компанию `/dashboard`.
3. Добавьте хотя бы одну услугу и специалиста; настройте часы и дни работы.
4. Откройте `/studio/<slug>` в отдельном браузере, создайте тестовую запись и проверьте её в кабинете владельца.
5. Два запроса на пересекающееся время одного специалиста: только один должен пройти.
6. Аккаунт другой компании не должен иметь доступ к вашим бронированиям.
7. Перезапустите сервис: запись должна остаться в Supabase. Перелогин после рестарта ожидаем: HTTP-сессии хранятся в памяти одного сервера.

## Ограничения концепта

- Это рабочий прототип для портфолио, не production-сервис для реальных клиентов.
- Нет SMS/email, платежей, синхронизации с внешним календарём, отдельных смен/перерывов и привязки отдельных услуг к отдельным мастерам. Каждый активный специалист компании доступен для каждой её услуги.
- Часовой пояс всех компаний — Europe/Tallinn; длительности и слоты кратны 30 минутам, горизонт записи 60 дней.
- Смена рабочих часов влияет на новые слоты; ранее созданные записи остаются в расписании.
- Удаление услуги/специалиста — архивирование, история записей сохраняется.
- Отмену выполняет владелец компании. Клиент видит свои записи, только если входил при бронировании; гостевые записи автоматически не присваиваются аккаунту.
- Базовый лимит: 30 попыток записи / 10 минут на адрес соединения; за общим прокси лимит может быть общим для пользователей. Для настоящего трафика нужен лимитер на доверенном edge/proxy и защита от спама.
- Предусмотрена одна реплика Java; сессии в памяти, ограничения запросов локальны процессу. Для масштабирования нужны общие сессии и распределённые ограничения.
- Нет самостоятельного удаления аккаунта, согласованных сроков хранения, контактов оператора и процесса обработки запросов на удаление. До настоящего запуска это нужно определить и отразить в privacy policy.
- Тесты проверяют Google redirect/state/nonce и отказ поддельному callback. Полный Google login требует реальных ключей и ручной проверки на опубликованном домене.
