# Настройка системы событий медитации

## 📋 Что нужно сделать:

### 1. Создать таблицу events и триггер в базе данных
```bash
# Выполнить миграции
supabase db push

# Или вручную выполнить SQL в Supabase Studio:
```

**Таблица events:**
```sql
-- Создание таблицы для отметок на карте
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  level smallint,
  client_id text not null
);

-- Индексы для производительности
create index if not exists events_created_at_idx on public.events (created_at desc);
create index if not exists events_client_id_idx on public.events (client_id);
create index if not exists events_coords_idx on public.events (lat, lng);
```

**Триггер для антиспама:**
```sql
-- Функция для проверки rate limit
CREATE OR REPLACE FUNCTION check_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Проверяем, есть ли события от этого client_id за последние 30 секунд
  IF EXISTS (
    SELECT 1 FROM events 
    WHERE client_id = NEW.client_id 
    AND created_at > NOW() - INTERVAL '30 seconds'
    AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'RATE_LIMIT: Too many requests from this client_id';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер
CREATE TRIGGER rate_limit_trigger
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION check_rate_limit();
```

### 2. Задеплоить функции
```bash
# Функция добавления событий
supabase functions deploy add-event

# Функция получения событий
supabase functions deploy get-events
```

### 3. Протестировать функции
```bash
# Запустить тест
.\test_events.ps1
```

## 🧪 Тестирование в браузере:

1. **Завершите медитацию** (нажмите "Завершить медитацию")
2. **Переключитесь на Light или Dark карту** (не Yin-Yang)
3. **Попробуйте долгое нажатие** (0.5 секунды) на карте
4. **Проверьте консоль** - должны исчезнуть CORS ошибки

## 📊 Что должно работать:

- ✅ Долгое нажатие создает желтую точку
- ✅ Данные отправляются на сервер
- ✅ При успехе точка становится зеленой
- ✅ Точки автоматически удаляются через 10 минут
- ✅ Существующие точки загружаются при открытии карты
- ✅ Антиспам защита (30 секунд между точками) - триггер в БД
- ✅ CORS правильно настроен (OPTIONS возвращает 204)

## 🔧 Отладка:

Если что-то не работает:

1. **Проверьте консоль браузера** на ошибки
2. **Запустите тест** `.\test_events.ps1`
3. **Проверьте таблицу events** в Supabase Studio
4. **Проверьте логи функций** в Supabase Dashboard
5. **Проверьте триггер** в Supabase Studio → Database → Functions

## 📁 Файлы системы:

- `supabase/migrations/20241201000000_create_events_table.sql` - миграция таблицы
- `supabase/migrations/20241201000001_create_rate_limit_trigger.sql` - миграция триггера
- `supabase/functions/add-event/index.ts` - функция добавления событий
- `supabase/functions/get-events/index.ts` - функция получения событий
- `tiles/map-tiles.js` - клиентская логика карты
- `test_events.ps1` - тестовый скрипт

## 🚀 Архитектура:

- **Frontend**: Долгое нажатие → желтая точка → POST на `/add-event`
- **Backend**: Валидация → вставка в БД → триггер проверяет rate limit
- **Rate Limit**: Триггер в БД блокирует частые запросы (30 сек)
- **CORS**: Правильно настроен для preflight и POST запросов
