# Меню для нас

Персональный grocery planner для двоих: меню, корзина, калории/БЖУ, бюджет и cashback.

Стек: React + TypeScript + Vite, Supabase Free, Cloudflare Worker, GitHub Pages.

Расчёт калорий ориентировочный и не является медицинской рекомендацией.

## Local development

```bash
npm install
cp .env.example .env
```

Заполните `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_API_URL=https://YOUR_WORKER.workers.dev
```

Запуск:

```bash
npm run dev
```

Откройте `http://localhost:5173`.

## Tests

```bash
npm test
```

Покрыто:

- BMR / TDEE / калории / БЖУ / клетчатка / железо
- цель по весу и срок
- cashback, упаковки, холодильник
- cashback, упаковки, effective price
- оптимизатор (бюджет, граммовки, переиспользование)
- наличие RLS-политик в миграции

## Build

```bash
npm run build
npm run preview
```

## Deployment

После `push` в `main` GitHub Actions:

1. ставит зависимости
2. запускает тесты
3. собирает frontend
4. публикует GitHub Pages

Если тесты падают, деплой останавливается.

Публичный адрес:

`https://kurenkovaanastasia70-dev.github.io/menu_for_us/`

### 1. GitHub

Репозиторий уже подключён: `menu_for_us`.

В Settings → Pages выберите **GitHub Actions**.

В Settings → Secrets and variables → Actions добавьте:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

### 2. GitHub Pages

Первый деплой произойдёт после того, как секреты заполнены и есть push в `main`.

### 3. Supabase

1. Создайте Free-проект на [supabase.com](https://supabase.com).
2. Project Settings → API: скопируйте **Project URL** и **anon public** ключ.
3. SQL Editor → вставьте по очереди:
   - `supabase/migrations/20260813120000_init.sql`
   - `supabase/migrations/20260813220000_fridge_and_micronutrients.sql`
   и нажмите Run.
4. Authentication → Providers → Email: включите Email.
5. Authentication → Sign Up / Providers: **отключите публичную регистрацию** (Disable sign-ups), потому что пользователей только двое.
6. Authentication → Users → Add user: создайте два аккаунта (ваши email).
7. Пользователи входят через экран Login. Пароль можно задать сразу или через «Забыли пароль».

Первый вошедший создаёт пару и видит **код приглашения**. Второй вводит этот код.

### 4. Cloudflare Worker

Нужен хотя бы один LLM-ключ. Достаточно **Gemini** — он пишет пошаговые гиды рецептов.

**Как получить ключ Gemini**

1. Откройте [Google AI Studio](https://aistudio.google.com/apikey).
2. Войдите аккаунтом Google.
3. Нажмите **Create API key** (Создать ключ).
4. Скопируйте строку вида `AIza...`. Никуда в приложение её не вставляйте — только в секрет воркера.

**Куда вставить, чтобы работало на github.io**

Ключ Gemini **нельзя** класть в GitHub Pages, в `.env` фронта и в секрет `VITE_*` — его увидят все, кто откроет сайт.

1. Ключ → только Cloudflare Worker:

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```

Терминал спросит значение — вставьте ключ и Enter.

2. URL воркера после `deploy` (пример: `https://menu-for-us-llm.XXXX.workers.dev`) → секрет GitHub **`VITE_API_URL`**:
   Settings → Secrets and variables → Actions → `VITE_API_URL`.
   Локально тот же URL в `.env`.

3. Пересоберите сайт: Actions → Deploy → Run workflow (или просто push в `main`).

Сайт на github.io ходит на воркер, воркер уже с ключом вызывает Gemini.

Запасные провайдеры (необязательно):

```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
```

### 5. Environment variables

Frontend:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
```

Cloudflare:

```env
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
LLM_PROVIDER=gemini
```

LLM-ключи никогда не попадают в frontend.

## Как пользоваться

1. Войти
2. Заполнить профиль (калории считаются автоматически)
3. Создать пару / ввести код
4. «Составить неделю» → бюджет и дни → «Рассчитать»
5. Меню, замена блюда, корзина: галочка «уже есть» и «купили»
6. История и «Повторить неделю»

На телефоне: «Добавить на экран домой» — это PWA.

## Каталог

MVP использует статические файлы, без парсинга магазинов:

- `src/data/products.json` — 100+ продуктов
- `src/data/store-products.json` — цены Пятёрочки, Магнита, Перекрёстка, Дикси
- `src/data/recipes.json` — 50+ рецептов

Интерфейс `StoreProvider` уже есть, реальные API магазинов можно подключить позже.
