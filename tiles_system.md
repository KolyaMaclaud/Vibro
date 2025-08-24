# Система тайлов для снапшотов мировой карты

## 📊 Структура данных

### Таблица `tiles_hourly`
```sql
CREATE TABLE tiles_hourly (
  id SERIAL PRIMARY KEY,
  day DATE NOT NULL,           -- Дата (YYYY-MM-DD)
  hour INTEGER NOT NULL,       -- Час (0-23)
  z INTEGER NOT NULL,          -- Уровень зума (0-10)
  x INTEGER NOT NULL,          -- X координата тайла
  y INTEGER NOT NULL,          -- Y координата тайла
  data BYTEA NOT NULL,         -- Сжатые данные (gzip JSON)
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(day, hour, z, x, y)
);

CREATE INDEX idx_tiles_hourly_lookup ON tiles_hourly(day, hour, z, x, y);
CREATE INDEX idx_tiles_hourly_recent ON tiles_hourly(day, hour) WHERE day >= CURRENT_DATE - INTERVAL '7 days';
```

### Формат данных в поле `data` (JSON)
```json
{
  "count": 1250,                    // Общее количество точек
  "colors": {                       // Распределение по цветам
    "red": 200,
    "orange": 180,
    "yellow": 160,
    "green": 140,
    "lightblue": 120,
    "blue": 100,
    "violet": 80
  },
  "sample": [                       // Семпл точек (до 5k)
    {
      "lat": 55.7558,
      "lon": 37.6176,
      "level": 3,
      "color": "green",
      "ts": 1640995200
    }
  ],
  "bounds": {                       // Границы тайла
    "min_lat": 55.0,
    "max_lat": 56.0,
    "min_lon": 37.0,
    "max_lon": 38.0
  }
}
```

## 🔄 CRON Job (каждый час)

### Edge Function: `generate_tiles_hourly`
```javascript
// Выполняется каждый час в :00 минут
export async function generateTilesHourly() {
  const now = new Date();
  const day = now.toISOString().split('T')[0];
  const hour = now.getHours();
  
  // Генерируем тайлы для уровней зума 0-10
  for (let z = 0; z <= 10; z++) {
    await generateTilesForZoom(z, day, hour);
  }
}

async function generateTilesForZoom(z, day, hour) {
  // Получаем все точки за последние 24 часа
  const points = await getPointsLast24Hours();
  
  // Разбиваем на тайлы для данного уровня зума
  const tiles = splitPointsIntoTiles(points, z);
  
  // Сохраняем каждый тайл
  for (const [tileKey, tileData] of Object.entries(tiles)) {
    const [x, y] = tileKey.split(',').map(Number);
    await saveTile(day, hour, z, x, y, tileData);
  }
}
```

## 🌐 API Endpoint

### GET `/api/tiles`
```javascript
// Параметры запроса
// z: уровень зума (0-10)
// x, y: координаты тайла
// day: дата (YYYY-MM-DD, опционально, по умолчанию сегодня)
// hour: час (0-23, опционально, по умолчанию текущий час)

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const z = parseInt(searchParams.get('z'));
  const x = parseInt(searchParams.get('x'));
  const y = parseInt(searchParams.get('y'));
  const day = searchParams.get('day') || new Date().toISOString().split('T')[0];
  const hour = parseInt(searchParams.get('hour')) || new Date().getHours();
  
  // Валидация параметров
  if (z < 0 || z > 10 || x < 0 || y < 0) {
    return new Response('Invalid parameters', { status: 400 });
  }
  
  // Получаем тайл из БД
  const tile = await getTile(day, hour, z, x, y);
  
  if (!tile) {
    return new Response('Tile not found', { status: 404 });
  }
  
  // Возвращаем данные
  return new Response(JSON.stringify(tile), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

## 🗂️ Функции для работы с тайлами

### Преобразование координат
```javascript
// Конвертация lat/lon в тайл
function latLonToTile(lat, lon, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lon + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return [x, y];
}

// Конвертация тайла в границы
function tileToBounds(x, y, z) {
  const n = Math.pow(2, z);
  const lon1 = x / n * 360 - 180;
  const lon2 = (x + 1) / n * 360 - 180;
  const lat1 = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const lat2 = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
  
  return {
    min_lat: Math.min(lat1, lat2),
    max_lat: Math.max(lat1, lat2),
    min_lon: Math.min(lon1, lon2),
    max_lon: Math.max(lon1, lon2)
  };
}
```

### Группировка точек по тайлам
```javascript
function splitPointsIntoTiles(points, z) {
  const tiles = {};
  
  for (const point of points) {
    const [x, y] = latLonToTile(point.lat, point.lon, z);
    const tileKey = `${x},${y}`;
    
    if (!tiles[tileKey]) {
      tiles[tileKey] = {
        count: 0,
        colors: { red: 0, orange: 0, yellow: 0, green: 0, lightblue: 0, blue: 0, violet: 0 },
        sample: [],
        bounds: tileToBounds(x, y, z)
      };
    }
    
    // Увеличиваем счетчик
    tiles[tileKey].count++;
    tiles[tileKey].colors[point.color]++;
    
    // Добавляем в семпл (до 5k для детальных уровней)
    const maxSample = z >= 8 ? 5000 : Math.min(1000, Math.pow(2, z) * 10);
    if (tiles[tileKey].sample.length < maxSample) {
      tiles[tileKey].sample.push({
        lat: point.lat,
        lon: point.lon,
        level: point.level,
        color: point.color,
        ts: point.ts
      });
    }
  }
  
  return tiles;
}
```

## 📦 Сжатие данных

### Gzip сжатие
```javascript
import { gzip, ungzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const ungzipAsync = promisify(ungzip);

async function compressTileData(data) {
  const jsonString = JSON.stringify(data);
  return await gzipAsync(jsonString);
}

async function decompressTileData(compressedData) {
  const jsonString = await ungzipAsync(compressedData);
  return JSON.parse(jsonString);
}
```

## 🚀 Интеграция с фронтендом

### Обновление функции загрузки маркеров
```javascript
// В vibro.html - обновляем функцию loadMarkers
async function loadMarkersFromTiles() {
  const currentZoom = Math.floor(view.s);
  const tiles = getVisibleTiles(currentZoom);
  
  const markers = [];
  
  for (const tile of tiles) {
    try {
      const response = await fetch(`/api/tiles?z=${tile.z}&x=${tile.x}&y=${tile.y}`);
      if (response.ok) {
        const tileData = await response.json();
        markers.push(...tileData.sample);
      }
    } catch (error) {
      console.error('Failed to load tile:', error);
    }
  }
  
  return markers;
}
```

## 📈 Оптимизации

### Кэширование
- Redis кэш для часто запрашиваемых тайлов
- TTL: 1 час для актуальных данных
- CDN для статических тайлов

### Индексы БД
```sql
-- Оптимизация для быстрого поиска
CREATE INDEX idx_events_ts ON events(ts) WHERE ts >= NOW() - INTERVAL '24 hours';
CREATE INDEX idx_events_location ON events(lat, lon) WHERE ts >= NOW() - INTERVAL '24 hours';
```

### Мониторинг
- Метрики загрузки тайлов
- Время генерации снапшотов
- Размер сжатых данных
- Hit/miss ratio кэша

