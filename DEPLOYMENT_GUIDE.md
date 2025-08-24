# Руководство по развертыванию системы тайлов

## 🚀 Этап 1: Настройка базы данных

### 1.1 Выполнение SQL скриптов

1. Откройте Supabase Dashboard
2. Перейдите в SQL Editor
3. Выполните скрипт `supabase_tiles_system.sql`:

```sql
-- Копируйте и выполните содержимое файла supabase_tiles_system.sql
```

### 1.2 Проверка создания таблиц

```sql
-- Проверьте, что таблица создана
SELECT * FROM tiles_hourly LIMIT 1;

-- Проверьте индексы
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tiles_hourly';

-- Проверьте функции
SELECT proname FROM pg_proc WHERE proname LIKE '%tile%';
```

## 🔧 Этап 2: Развертывание Edge Functions

### 2.1 Установка Supabase CLI

```bash
npm install -g supabase
```

### 2.2 Инициализация проекта

```bash
supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_ID
```

### 2.3 Развертывание функций

```bash
# Развертывание функции генерации тайлов
supabase functions deploy generate-tiles-hourly

# Развертывание функции получения тайлов
supabase functions deploy get-tiles
```

### 2.4 Настройка переменных окружения

В Supabase Dashboard → Settings → Edge Functions:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## ⏰ Этап 3: Настройка CRON

### 3.1 Создание CRON job

В Supabase Dashboard → Database → Functions:

```sql
-- Создание CRON job для генерации тайлов каждый час
SELECT cron.schedule(
  'generate-tiles-hourly',
  '0 * * * *', -- Каждый час в :00 минут
  'SELECT net.http_post(
    url := ''https://your-project.supabase.co/functions/v1/generate-tiles-hourly'',
    headers := ''{"Authorization": "Bearer your-service-role-key", "Content-Type": "application/json"}'',
    body := ''{}''
  );'
);
```

### 3.2 Альтернативный способ через GitHub Actions

Создайте `.github/workflows/generate-tiles.yml`:

```yaml
name: Generate Tiles Hourly

on:
  schedule:
    - cron: '0 * * * *'  # Каждый час

jobs:
  generate-tiles:
    runs-on: ubuntu-latest
    steps:
      - name: Generate tiles
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            https://your-project.supabase.co/functions/v1/generate-tiles-hourly
```

## 🧪 Этап 4: Тестирование

### 4.1 Тест генерации тайлов

```bash
# Ручной запуск генерации
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  https://your-project.supabase.co/functions/v1/generate-tiles-hourly
```

### 4.2 Тест получения тайлов

```bash
# Получение конкретного тайла
curl "https://your-project.supabase.co/functions/v1/get-tiles?z=5&x=16&y=10"

# Получение видимых тайлов для области
curl "https://your-project.supabase.co/functions/v1/get-tiles?z=5&bounds={\"minLat\":55,\"maxLat\":56,\"minLon\":37,\"maxLon\":38}"
```

### 4.3 Проверка данных в БД

```sql
-- Проверка созданных тайлов
SELECT day, hour, z, COUNT(*) as tiles_count 
FROM tiles_hourly 
WHERE day = CURRENT_DATE 
GROUP BY day, hour, z 
ORDER BY hour DESC, z;

-- Проверка статистики
SELECT * FROM get_tiles_stats() LIMIT 10;
```

## 📊 Этап 5: Мониторинг

### 5.1 Создание дашборда мониторинга

```sql
-- Представление для мониторинга
CREATE VIEW tiles_monitoring AS
SELECT 
  day,
  hour,
  z,
  COUNT(*) as tiles_count,
  SUM(LENGTH(data)) as total_size_bytes,
  AVG(LENGTH(data)) as avg_size_bytes,
  MIN(created_at) as first_tile,
  MAX(created_at) as last_tile
FROM tiles_hourly
WHERE day >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY day, hour, z
ORDER BY day DESC, hour DESC, z;
```

### 5.2 Настройка алертов

```sql
-- Функция для проверки здоровья системы
CREATE OR REPLACE FUNCTION check_tiles_health()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSON
) AS $$
DECLARE
  recent_tiles_count INTEGER;
  last_generation TIMESTAMP;
BEGIN
  -- Проверяем количество тайлов за последний час
  SELECT COUNT(*) INTO recent_tiles_count
  FROM tiles_hourly
  WHERE day = CURRENT_DATE 
    AND hour = EXTRACT(HOUR FROM NOW() - INTERVAL '1 hour');
  
  -- Проверяем время последней генерации
  SELECT MAX(created_at) INTO last_generation
  FROM tiles_hourly
  WHERE day = CURRENT_DATE;
  
  IF recent_tiles_count = 0 THEN
    RETURN QUERY SELECT 
      'ERROR'::TEXT,
      'No tiles generated in the last hour'::TEXT,
      json_build_object('tiles_count', recent_tiles_count, 'last_generation', last_generation);
  ELSIF recent_tiles_count < 100 THEN
    RETURN QUERY SELECT 
      'WARNING'::TEXT,
      'Low tile count in the last hour'::TEXT,
      json_build_object('tiles_count', recent_tiles_count, 'last_generation', last_generation);
  ELSE
    RETURN QUERY SELECT 
      'OK'::TEXT,
      'Tiles generation is healthy'::TEXT,
      json_build_object('tiles_count', recent_tiles_count, 'last_generation', last_generation);
  END IF;
END;
$$ LANGUAGE plpgsql;
```

## 🔄 Этап 6: Интеграция с фронтендом

### 6.1 Обновление функции загрузки маркеров

В `vibro.html` добавьте:

```javascript
// Функция для загрузки маркеров из тайлов
async function loadMarkersFromTiles() {
  const currentZoom = Math.floor(view.s);
  const bounds = getVisibleBounds();
  
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/get-tiles?z=${currentZoom}&bounds=${JSON.stringify(bounds)}`
    );
    
    if (response.ok) {
      const tiles = await response.json();
      const markers = [];
      
      for (const tile of tiles) {
        markers.push(...tile.data.sample);
      }
      
      return markers;
    }
  } catch (error) {
    console.error('Failed to load tiles:', error);
    // Fallback к старому методу
    return loadMarkers();
  }
}

// Функция получения видимых границ
function getVisibleBounds() {
  const centerLat = view.y;
  const centerLon = view.x;
  const zoom = view.s;
  
  // Примерный расчет границ (упрощенно)
  const latDelta = 180 / Math.pow(2, zoom);
  const lonDelta = 360 / Math.pow(2, zoom);
  
  return {
    minLat: centerLat - latDelta / 2,
    maxLat: centerLat + latDelta / 2,
    minLon: centerLon - lonDelta / 2,
    maxLon: centerLon + lonDelta / 2
  };
}
```

### 6.2 Переключение на новую систему

```javascript
// В функции инициализации карты
function initMap() {
  // ... существующий код ...
  
  // Используем новую систему загрузки маркеров
  if (USE_TILES_SYSTEM) {
    markers = await loadMarkersFromTiles();
  } else {
    markers = loadMarkers(); // старый метод
  }
}
```

## 🚨 Этап 7: Очистка и обслуживание

### 7.1 Настройка автоматической очистки

```sql
-- CRON job для очистки старых тайлов (раз в неделю)
SELECT cron.schedule(
  'cleanup-old-tiles',
  '0 2 * * 0', -- Каждое воскресенье в 2:00
  'SELECT cleanup_old_tiles();'
);
```

### 7.2 Мониторинг размера БД

```sql
-- Проверка размера таблицы тайлов
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE tablename = 'tiles_hourly';
```

## ✅ Чек-лист развертывания

- [ ] SQL скрипты выполнены в Supabase
- [ ] Edge Functions развернуты
- [ ] Переменные окружения настроены
- [ ] CRON job создан
- [ ] Тестирование пройдено
- [ ] Мониторинг настроен
- [ ] Фронтенд обновлен
- [ ] Автоматическая очистка настроена

## 📈 Ожидаемые результаты

После развертывания:

1. **Производительность:** Загрузка маркеров ускорится в 10-100 раз
2. **Масштабируемость:** Система выдержит миллионы точек
3. **Надежность:** Автоматическое создание снапшотов каждый час
4. **Экономия:** Снижение нагрузки на БД и API

