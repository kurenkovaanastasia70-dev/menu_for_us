# Personal Grocery Planner — техническое задание

## 1. Контекст проекта

Разработать персональное веб-приложение для двух пользователей — меня и моего парня.

Цель приложения:

> Автоматически планировать питание на несколько дней, составлять оптимальную продуктовую корзину и меню с учётом калорий, БЖУ, целей по весу, бюджета, цен в магазинах, cashback, времени на готовку и переиспользования продуктов.

Приложение не является коммерческим сервисом и рассчитано только на двух пользователей.

Главные приоритеты:

1. минимальная стоимость продуктов;
2. контроль калорий и БЖУ;
3. минимальное количество продуктов;
4. максимальное переиспользование ингредиентов;
5. минимальное время готовки;
6. разнообразное и вкусное питание;
7. минимальные усилия пользователя;
8. синхронизация между устройствами;
9. история прошлых меню и корзин.

---

# 2. Ограничения инфраструктуры

Приложение должно работать практически бесплатно.

НЕ использовать:

- собственный VPS;
- платный сервер;
- собственный компьютер как сервер;
- постоянно работающий backend;
- Docker для production без необходимости;
- отдельную платную БД.

Использовать:

### Frontend

GitHub Pages.

### Repository

GitHub.

### Database + Auth

Supabase Free.

### Serverless backend

Cloudflare Workers Free.

### LLM

Поддержать:

- Gemini;
- Groq;
- OpenRouter.

API keys хранить только на Cloudflare Worker.

---

# 3. Архитектура

```text
                    GitHub
                       │
                       ↓
                GitHub Pages
                       │
                       ↓
              React Web Application
                       │
             ┌─────────┴─────────┐
             ↓                   ↓
        Supabase            Cloudflare Worker
        Auth + DB                 │
             │                    ↓
             │              Gemini / Groq
             │              / OpenRouter
             ↓
       2 пользователя
```

GitHub Pages отвечает только за frontend.

Supabase отвечает за:

- authentication;
- хранение профилей;
- меню;
- корзины;
- историю;
- пользовательские настройки.

Cloudflare Worker отвечает за:

- LLM API;
- секретные API keys;
- при необходимости будущие server-side операции.

---

# 4. Frontend

Использовать:

- React;
- TypeScript;
- Vite;
- Tailwind CSS;
- shadcn/ui или аналогичный лёгкий UI kit.

Приложение должно быть responsive.

Основной сценарий:

```text
Login
 ↓
Dashboard
 ↓
Планирование недели
 ↓
Расчёт питания
 ↓
Меню
 ↓
Корзина
 ↓
Сохранение
 ↓
История
```

Приложение должно нормально работать:

- на desktop;
- на iPhone;
- на Android.

---

# 5. Authentication

Использовать Supabase Auth.

Только два пользователя.

Не нужна публичная регистрация.

Предусмотреть:

- login;
- logout;
- password reset;
- session persistence.

После авторизации пользователь должен видеть только собственные данные и общие данные пары.

---

# 6. Модель пользователей

Создать сущность:

```typescript
UserProfile {
    id
    user_id
    name
    gender
    birth_date
    height_cm
    weight_kg
    activity_level
    goal
    target_weight_kg
    calorie_target
    protein_target
    fat_target
    carbs_target
}
```

Поддерживать два профиля.

---

# 7. Пара

Создать сущность household:

```typescript
Household {
    id
    name
}
```

Пользователь связан с household:

```text
User
 ↓
Household
 ↓
2 profiles
```

Все общие данные должны принадлежать household.

Например:

- корзины;
- меню;
- cashback;
- магазины;
- настройки;
- рецепты.

---

# 8. Профиль питания

Для каждого человека задавать:

### Основные данные

- пол;
- возраст;
- рост;
- вес;
- целевой вес;
- активность.

### Цель

- похудение;
- поддержание;
- набор.

### Питание

- количество приёмов пищи;
- перекусы;
- предпочтения;
- исключённые продукты;
- аллергии;
- тип питания.

### Готовка

- максимальное время приготовления;
- количество готовок в неделю;
- возможность готовить batch meals.

---

# 9. Расчёт калорий

Реализовать детерминированный nutrition calculator.

Не использовать LLM.

Рассчитать:

- BMR;
- TDEE;
- target calories.

Поддержать:

- дефицит;
- поддержание;
- профицит.

Показывать пользователю:

```text
BMR
TDEE
Target calories
```

Расчёты должны быть покрыты unit tests.

Важно: расчёт является ориентировочным и не должен позиционироваться как медицинская рекомендация.

---

# 10. БЖУ

Рассчитать:

- белок;
- жиры;
- углеводы.

Хранить индивидуальные targets.

Показывать:

```text
Calories: 1850 kcal
Protein: 125 g
Fat: 60 g
Carbs: 190 g
```

---

# 11. Параметры планирования

Форма:

## Планирование

Пользователь задаёт:

- количество дней;
- бюджет;
- магазины;
- количество приёмов пищи;
- максимальное время готовки;
- количество готовок;
- желаемое разнообразие.

Пример:

```text
7 дней
6000 ₽
2 человека
3 готовки в неделю
до 40 минут
```

---

# 12. Бюджет

Пользователь задаёт:

```text
budget = 6000 ₽
```

Optimizer должен стремиться не превышать бюджет.

Если задача невозможна:

показать:

> При текущих ограничениях бюджет недостаточен.

И предложить:

- увеличить бюджет;
- изменить продукты;
- снизить требования;
- увеличить срок.

---

# 13. Магазины

На MVP поддержать:

- Пятёрочка;
- Перекрёсток;
- Дикси;
- Магнит.

Но НЕ писать четыре жёстко связанных парсера.

Создать abstraction:

```typescript
interface StoreProvider {
    searchProducts(query: string): Promise<StoreProduct[]>;
    getProduct(productId: string): Promise<StoreProduct | null>;
    getPrice(productId: string): Promise<number>;
}
```

Каждый магазин — отдельный provider.

---

# 14. Источники цен

Приложение должно работать без реального scraping.

Основной MVP:

```text
products.json
prices.json
```

В GitHub repository.

Позже можно добавить:

- API;
- scraping;
- ручной импорт CSV.

Не реализовывать обход CAPTCHA, антиботов или других защитных механизмов.

Перед подключением реального источника проверить допустимость автоматического сбора данных.

---

# 15. Каталог продуктов

Создать canonical product database.

Пример:

```typescript
Product {
    id
    canonical_name
    category
    calories_per_100g
    protein_per_100g
    fat_per_100g
    carbs_per_100g
    package_weight
    unit
}
```

Примеры:

```text
chicken_breast
rice
buckwheat
eggs
cottage_cheese
greek_yogurt
banana
tomato
cucumber
potato
```

Начальный seed:

минимум 100 продуктов.

---

# 16. Магазинные продукты

Отдельная модель:

```typescript
StoreProduct {
    id
    canonical_product_id
    store_id
    external_id
    name
    brand
    package_weight
    price
    available
    url
    updated_at
}
```

Один canonical product может иметь много StoreProduct.

---

# 17. Cashback

Создать настройки cashback.

Пример:

```text
Пятёрочка — 5%
Магнит — 3%
Перекрёсток — 7%
```

Хранить:

```typescript
CashbackRule {
    household_id
    store_id
    percent
}
```

Рассчитывать:

```text
effective_price =
price * (1 - cashback / 100)
```

Optimizer использует effective_price.

---

# 18. Корзина

Корзина содержит:

```typescript
Cart {
    id
    household_id
    planning_period
    total_price
    total_cashback
    effective_price
}
```

И:

```typescript
CartItem {
    cart_id
    product_id
    store_id
    quantity
    package_count
    package_weight
    price
    cashback
}
```

Показывать:

```text
Куриное филе
1.5 кг
Пятёрочка
599 ₽
cashback 5%
effective 569 ₽
```

---

# 19. Главная оптимизационная задача

Создать отдельный модуль:

```text
src/lib/optimizer/
```

Он получает:

```typescript
OptimizationInput {
    people
    days
    calorieTargets
    macroTargets
    budget
    products
    prices
    recipes
    constraints
}
```

Возвращает:

```typescript
OptimizationResult {
    menu
    cart
    totalCost
    cashback
    effectiveCost
    nutritionSummary
    varietyScore
    wasteScore
}
```

---

# 20. Оптимизация

Цель:

```text
minimize:

cost
+ number_of_unique_products
+ unused_products
+ cooking_time
+ menu_repetition
```

При ограничениях:

```text
calories ≈ target
protein >= target
fat >= target
carbs >= target
cost <= budget
```

Дополнительно:

- ограничить число уникальных продуктов;
- ограничить количество магазинов;
- учитывать упаковки;
- минимизировать остатки;
- учитывать время готовки;
- поддерживать разнообразие.

---

# 21. Важное правило оптимизатора

Не оптимизировать только стоимость.

Самая дешёвая корзина может оказаться ужасной.

Например:

```text
рис + яйца + макароны
```

может быть дешевле, но не удовлетворять требованию разнообразия.

Поэтому использовать weighted objective:

```text
cost
+
λ_unique_products
+
λ_cooking_time
+
λ_waste
+
λ_repetition
```

Значения lambda вынести в конфигурацию.

---

# 22. Переиспользование продуктов

Это один из главных KPI приложения.

Если куплено:

```text
1.5 кг курицы
```

желательно использовать её в нескольких блюдах.

Например:

```text
Пн — курица терияки
Вт — куриный боул
Чт — паста с курицей
```

Минимизировать:

```text
unused_weight
```

---

# 23. Упаковки

Optimizer должен учитывать, что продукты продаются упаковками.

Например:

```text
нужно 700 г курицы

магазин:
900 г — 399 ₽
```

Корзина должна содержать:

```text
900 г
399 ₽
```

а не 700 г.

Оставшиеся 200 г учитывать как потенциальный остаток.

---

# 24. Рецепты

Создать recipe database.

```typescript
Recipe {
    id
    name
    cuisine
    meal_type
    cooking_time
    difficulty
    ingredients
    instructions
    calories
    protein
    fat
    carbs
}
```

Начальный seed:

минимум 50 рецептов.

---

# 25. LLM

LLM НЕ отвечает за:

- калории;
- БЖУ;
- цены;
- оптимизацию;
- математические ограничения.

LLM отвечает за:

- подбор блюд из уже рассчитанных продуктов;
- вариативность;
- рецепты;
- замены;
- описание блюд.

---

# 26. LLM abstraction

Создать:

```typescript
interface LLMProvider {
    generateMenu(input: MenuGenerationInput): Promise<Menu>;
    generateAlternatives(input: AlternativeInput): Promise<Alternative[]>;
}
```

Поддержать:

```text
GeminiProvider
GroqProvider
OpenRouterProvider
```

Provider выбирать через environment variable:

```env
LLM_PROVIDER=gemini
```

---

# 27. Cloudflare Worker

Создать отдельный worker:

```text
/cloudflare-worker
```

Frontend НЕ должен обращаться напрямую к Gemini/Groq/OpenRouter.

Frontend:

```text
POST /api/generate-menu
```

Worker:

```text
→ validates request
→ calls LLM
→ validates JSON
→ returns result
```

API keys:

```text
GEMINI_API_KEY
GROQ_API_KEY
OPENROUTER_API_KEY
```

только в Cloudflare secrets.

---

# 28. LLM output

LLM обязана возвращать JSON.

Например:

```json
{
  "days": [
    {
      "day": 1,
      "meals": [
        {
          "name": "Курица терияки с рисом",
          "recipe_id": "recipe_12",
          "ingredients": [
            {
              "product_id": "chicken",
              "grams": 250
            }
          ]
        }
      ]
    }
  ]
}
```

Использовать schema validation.

Если JSON невалиден:

- retry;
- fallback;
- показать ошибку.

---

# 29. Генерация меню

Алгоритм:

```text
User parameters
        ↓
Nutrition calculator
        ↓
Product catalog
        ↓
Optimizer
        ↓
Candidate products / quantities
        ↓
LLM
        ↓
Recipes / meals
        ↓
Validation
        ↓
Final menu
        ↓
Cart
```

После LLM-генерации повторно проверить:

- calories;
- protein;
- fat;
- carbs;
- ingredients;
- budget.

LLM не может изменить итоговую стоимость без повторного расчёта.

---

# 30. Разнообразие

Создать:

```text
variety_score
```

Учитывать:

- количество разных блюд;
- количество белковых источников;
- овощи;
- гарниры;
- разные кухни;
- повторение блюд.

Не допускать, например:

```text
Курица + рис
Курица + рис
Курица + рис
```

7 дней подряд.

---

# 31. Meal prep

Пользователь задаёт:

```text
max_cooking_sessions = 3
```

Система должна группировать блюда.

Например:

### Воскресенье

Приготовить:

- курицу;
- рис;
- овощи.

Использовать в:

- Пн;
- Вт;
- Ср.

### Среда

Приготовить:

- пасту;
- соус.

---

# 32. UI Dashboard

Главный экран:

```text
Моя неделя

2 человека
7 дней

1 850 kcal
125 g protein

Бюджет
5 460 ₽
```

Ниже:

```text
ПОНЕДЕЛЬНИК

Завтрак
Овсянка + банан

Обед
Курица терияки + рис

Ужин
Омлет + овощи
```

---

# 33. Экран "Корзина"

Показывать:

```text
Продукт
Количество
Магазин
Цена
Cashback
Effective price
```

Сводка:

```text
Стоимость: 5 780 ₽
Cashback: 320 ₽
Итого: 5 460 ₽
```

Также:

```text
Пятёрочка: 2 300 ₽
Магнит: 1 900 ₽
Перекрёсток: 1 260 ₽
```

---

# 34. Экран "История"

Показывать:

```text
Август 2026

11–17 августа
5 460 ₽
7 дней

4–10 августа
5 720 ₽
7 дней

28 июля – 3 августа
5 300 ₽
7 дней
```

При открытии:

- меню;
- корзина;
- цены;
- стоимость;
- калории.

---

# 35. Повтор недели

Кнопка:

> Повторить неделю

Создаёт новый planning period.

Можно:

```text
Повторить полностью
Изменить бюджет
Изменить калории
Изменить продукты
Обновить блюда
```

---

# 36. Замена блюда

На каждой карточке блюда:

```text
🔄 Заменить
```

Показать 3 варианта.

Приоритет:

1. продукты уже есть в корзине;
2. минимальная дополнительная стоимость;
3. соответствие калориям;
4. соответствие БЖУ;
5. разнообразие.

---

# 37. Замена продукта

Например:

```text
Лосось → курица
Рис → гречка
Йогурт → творог
```

После замены:

```text
recalculate nutrition
recalculate cart
recalculate cost
```

---

# 38. Синхронизация

Все важные данные хранить в Supabase.

НЕ хранить основное состояние только в localStorage.

localStorage использовать только для:

- UI preferences;
- временного состояния;
- cache.

Источник истины:

```text
Supabase
```

---

# 39. Supabase database

Создать таблицы:

```text
households
household_members
profiles
stores
products
store_products
cashback_rules
recipes
recipe_ingredients
meal_plans
meal_plan_days
meals
meal_ingredients
carts
cart_items
```

Все таблицы должны иметь:

```text
created_at
updated_at
```

---

# 40. Row Level Security

Обязательно включить Supabase RLS.

Пользователь может читать/изменять:

- свой profile;
- household data только своего household.

Никакой пользователь не должен получить данные другого household.

---

# 41. Источник каталога

На MVP:

```text
src/data/products.json
src/data/store-products.json
src/data/recipes.json
```

При необходимости импортировать данные в Supabase.

Система должна позволять перейти от JSON к DB без переписывания UI.

---

# 42. Парсинг магазинов

НЕ делать частью первой версии.

Сначала создать:

```typescript
StoreProvider
```

и mock implementation.

После готовности приложения подключать реальные источники.

Порядок:

1. Пятёрочка;
2. Магнит;
3. Перекрёсток;
4. Дикси.

Если scraping невозможен — приложение продолжает работать на:

- ручном вводе;
- CSV;
- статическом каталоге.

---

# 43. Автоматическое обновление цен

В будущем:

```text
Cloudflare Cron
       ↓
Store Provider
       ↓
prices
       ↓
Supabase
```

Но эта функция НЕ является обязательной для MVP.

---

# 44. Mobile-first

Основной сценарий должен быть удобен с телефона.

Особенно:

- просмотр меню;
- просмотр корзины;
- замена блюда;
- отметка купленных продуктов.

Добавить:

```text
☑ Куплено
```

к каждому продукту корзины.

---

# 45. PWA

Сделать приложение PWA.

Пользователь должен иметь возможность:

> "Добавить на экран домой"

Не требуется App Store / Google Play.

---

# 46. Тестирование

Обязательно написать unit tests для:

### Nutrition

- BMR;
- TDEE;
- calorie target;
- macros.

### Money

- cashback;
- effective price;
- package price.

### Optimizer

- budget;
- calorie constraints;
- macro constraints;
- package quantities;
- product reuse.

### Security

- RLS.

---

# 47. Error handling

Приложение не должно ломаться, если:

- LLM API недоступен;
- магазин недоступен;
- нет цены;
- недостаточно продуктов;
- невозможно удовлетворить бюджет;
- LLM вернула неправильный JSON.

Показывать понятные пользователю сообщения.

---

# 48. Offline/fallback

Основной каталог и рецепты должны быть доступны без LLM.

Если LLM недоступна:

```text
fallback recipe database
```

Если Supabase временно недоступен:

показать сохранённый локальный cache, если он существует.

---

# 49. Deployment

Настроить:

### GitHub

Repository:

```text
personal-grocery-planner
```

### GitHub Pages

Deploy frontend через GitHub Actions.

### Supabase

Создать Free project.

### Cloudflare

Создать Worker.

---

# 50. GitHub Actions

Создать workflow:

```text
.github/workflows/deploy.yml
```

Pipeline:

```text
push main
   ↓
npm install
   ↓
npm test
   ↓
npm build
   ↓
deploy GitHub Pages
```

Если тесты не проходят — deployment должен прекращаться.

---

# 51. Environment variables

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
```

Никогда не хранить LLM API keys в frontend.

---

# 52. README

Создать подробный README:

## Local development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Build

```bash
npm run build
```

## Deployment

описать:

1. GitHub;
2. GitHub Pages;
3. Supabase;
4. Cloudflare Worker;
5. environment variables.

---

# 53. Этапы реализации

НЕ писать всё сразу.

Работать итерациями.

## Phase 1 — Foundation

Создать:

- React;
- TypeScript;
- Tailwind;
- routing;
- layout;
- GitHub Actions;
- GitHub Pages.

Приложение должно открываться.

---

## Phase 2 — Supabase

Создать:

- project;
- schema;
- auth;
- RLS;
- household;
- profiles.

Сделать login.

---

## Phase 3 — Nutrition

Создать:

- BMR;
- TDEE;
- calories;
- macros.

Добавить tests.

---

## Phase 4 — Products

Создать:

- products;
- stores;
- prices;
- recipes;
- seed.

---

## Phase 5 — Optimizer

Создать:

- budget optimizer;
- package optimizer;
- product reuse;
- nutrition constraints;
- variety score.

Сначала можно использовать упрощённый greedy algorithm.

Архитектура должна позволять позже заменить его на полноценный MILP/OR-Tools.

---

## Phase 6 — Menu

Создать:

- weekly menu;
- meals;
- grams;
- nutrition.

---

## Phase 7 — LLM

Подключить:

- Cloudflare Worker;
- Gemini;
- Groq;
- OpenRouter fallback.

---

## Phase 8 — Cart

Создать:

- store selection;
- cashback;
- effective price;
- cart;
- shopping checklist.

---

## Phase 9 — History

Создать:

- saved weeks;
- past carts;
- repeat week.

---

## Phase 10 — PWA

Добавить:

- manifest;
- service worker;
- installability;
- mobile UI.

---

# 54. UX-принцип

Пользователь не должен каждый раз вводить всё заново.

Основной flow:

```text
Открыть приложение
      ↓
"Составить неделю"
      ↓
Выбрать бюджет
      ↓
Нажать "Рассчитать"
      ↓
Получить меню + корзину
```

Профили, магазины, cashback и предпочтения сохраняются.

---

# 55. Главная страница

Должна содержать три основных действия:

```text
┌──────────────────────────────┐
│       Моя неделя             │
│                              │
│  1 850 kcal   5 460 ₽        │
│                              │
│  [ Посмотреть меню ]          │
│  [ Посмотреть корзину ]       │
│  [ Составить новую неделю ]   │
└──────────────────────────────┘
```

---

# 56. Важное архитектурное требование

Не создавать unnecessary complexity.

Для приложения на двух пользователей:

НЕ нужны:

- Kubernetes;
- Docker Swarm;
- Redis;
- Kafka;
- отдельный backend server;
- отдельная production database server;
- микросервисы.

Использовать serverless architecture.

---

# 57. Целевой стек

Итоговый stack:

```text
Frontend
React + TypeScript + Vite
        ↓
GitHub Pages

Auth + Database
Supabase Free

LLM backend
Cloudflare Workers Free

LLM
Gemini / Groq / OpenRouter

Repository
GitHub

CI/CD
GitHub Actions
```

---

# 58. Критерий успешного MVP

После выполнения задания я должна иметь публичное приложение, которое:

1. открывается с телефона;
2. позволяет войти двум пользователям;
3. синхронизирует их данные;
4. хранит профили;
5. рассчитывает калории;
6. рассчитывает БЖУ;
7. принимает бюджет;
8. принимает количество дней;
9. содержит каталог продуктов;
10. содержит рецепты;
11. составляет меню;
12. рассчитывает граммовки;
13. формирует корзину;
14. учитывает цены;
15. учитывает cashback;
16. минимизирует стоимость;
17. старается переиспользовать продукты;
18. учитывает разнообразие;
19. позволяет заменить блюдо;
20. сохраняет историю;
21. позволяет повторить прошлую неделю;
22. работает без постоянно работающего сервера;
23. использует только бесплатную инфраструктуру;
24. не раскрывает LLM API keys клиенту.

---

# 59. Правила для Cursor Agent

При реализации:

1. Сначала изучи весь проект.
2. Перед крупными изменениями предложи краткий план.
3. Не переписывай рабочий код без необходимости.
4. Не добавляй зависимости без объяснения зачем они нужны.
5. После каждого этапа запускай tests и build.
6. Не хардкодь API keys.
7. Не хардкодь пользователей.
8. Все database migrations храни в `/supabase/migrations`.
9. Все секреты храни только в environment variables.
10. Все внешние API оборачивай в отдельный provider.
11. Не смешивай UI, бизнес-логику и database access.
12. Все расчёты питания должны быть детерминированными.
13. LLM никогда не является источником истины для числовых данных.
14. После LLM generation обязательно валидировать результат.
15. Если полноценный optimizer слишком сложен для первого этапа — реализовать простой рабочий алгоритм, но сохранить интерфейс `OptimizationEngine`, чтобы позже заменить реализацию.
16. Не реализовывать scraping магазинов до готовности основного MVP.
17. Не использовать платные сервисы.
18. Если бесплатный сервис имеет лимит — учитывать его в архитектуре.
19. Не создавать ненужную инфраструктуру.
20. В конце каждого этапа обновлять README.

---

# 60. Definition of Done

Проект считается завершённым, когда:

```text
npm install
npm run dev
```

запускает приложение локально,

а после push в `main`:

```text
GitHub
   ↓
GitHub Actions
   ↓
GitHub Pages
```

автоматически публикует рабочее приложение.

Пользователь может:

```text
Login
 ↓
Profile
 ↓
Nutrition
 ↓
Budget
 ↓
Generate week
 ↓
Menu
 ↓
Cart
 ↓
Save
 ↓
History
```

без ручного вмешательства разработчика.

Главная цель:

**получить реально работающий персональный grocery planner для двух человек с минимальной стоимостью инфраструктуры и минимальной ручной работой пользователя.**