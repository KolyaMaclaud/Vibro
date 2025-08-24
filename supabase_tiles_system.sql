-- Система тайлов для снапшотов мировой карты
-- Supabase SQL скрипты

-- 1. Создание таблицы для тайлов
CREATE TABLE IF NOT EXISTS tiles_hourly (
  id BIGSERIAL PRIMARY KEY,
  day DATE NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  z INTEGER NOT NULL CHECK (z >= 0 AND z <= 10),
  x INTEGER NOT NULL CHECK (x >= 0),
  y INTEGER NOT NULL CHECK (y >= 0),
  data BYTEA NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(day, hour, z, x, y)
);

-- 2. Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_tiles_hourly_lookup 
ON tiles_hourly(day, hour, z, x, y);

CREATE INDEX IF NOT EXISTS idx_tiles_hourly_recent 
ON tiles_hourly(day, hour) 
WHERE day >= CURRENT_DATE - INTERVAL '7 days';

CREATE INDEX IF NOT EXISTS idx_tiles_hourly_zoom 
ON tiles_hourly(z, day, hour) 
WHERE day >= CURRENT_DATE - INTERVAL '24 hours';

-- 3. Индексы для таблицы events (если еще не созданы)
CREATE INDEX IF NOT EXISTS idx_events_ts 
ON events(ts) 
WHERE ts >= NOW() - INTERVAL '24 hours';

CREATE INDEX IF NOT EXISTS idx_events_location 
ON events(lat, lon) 
WHERE ts >= NOW() - INTERVAL '24 hours';

CREATE INDEX IF NOT EXISTS idx_events_ts_location 
ON events(ts, lat, lon) 
WHERE ts >= NOW() - INTERVAL '24 hours';

-- 4. Функция для получения точек за последние 24 часа
CREATE OR REPLACE FUNCTION get_points_last_24h()
RETURNS TABLE (
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  level INTEGER,
  color TEXT,
  ts BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.lat,
    e.lon,
    e.level,
    e.color,
    EXTRACT(EPOCH FROM e.ts)::BIGINT as ts
  FROM events e
  WHERE e.ts >= NOW() - INTERVAL '24 hours'
  ORDER BY e.ts DESC;
END;
$$ LANGUAGE plpgsql;

-- 5. Функция для сохранения тайла
CREATE OR REPLACE FUNCTION save_tile(
  p_day DATE,
  p_hour INTEGER,
  p_z INTEGER,
  p_x INTEGER,
  p_y INTEGER,
  p_data BYTEA
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO tiles_hourly (day, hour, z, x, y, data)
  VALUES (p_day, p_hour, p_z, p_x, p_y, p_data)
  ON CONFLICT (day, hour, z, x, y)
  DO UPDATE SET 
    data = EXCLUDED.data,
    created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 6. Функция для получения тайла
CREATE OR REPLACE FUNCTION get_tile(
  p_day DATE,
  p_hour INTEGER,
  p_z INTEGER,
  p_x INTEGER,
  p_y INTEGER
)
RETURNS BYTEA AS $$
DECLARE
  tile_data BYTEA;
BEGIN
  SELECT data INTO tile_data
  FROM tiles_hourly
  WHERE day = p_day 
    AND hour = p_hour 
    AND z = p_z 
    AND x = p_x 
    AND y = p_y;
  
  RETURN tile_data;
END;
$$ LANGUAGE plpgsql;

-- 7. Функция для получения видимых тайлов
CREATE OR REPLACE FUNCTION get_visible_tiles(
  p_z INTEGER,
  p_min_lat DOUBLE PRECISION,
  p_max_lat DOUBLE PRECISION,
  p_min_lon DOUBLE PRECISION,
  p_max_lon DOUBLE PRECISION,
  p_day DATE DEFAULT CURRENT_DATE,
  p_hour INTEGER DEFAULT EXTRACT(HOUR FROM NOW())
)
RETURNS TABLE (
  x INTEGER,
  y INTEGER,
  data BYTEA
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    th.x,
    th.y,
    th.data
  FROM tiles_hourly th
  WHERE th.z = p_z
    AND th.day = p_day
    AND th.hour = p_hour
    -- Фильтруем тайлы, которые пересекаются с видимой областью
    AND th.x >= FLOOR((p_min_lon + 180) / 360 * POWER(2, p_z))
    AND th.x <= FLOOR((p_max_lon + 180) / 360 * POWER(2, p_z))
    AND th.y >= FLOOR((1 - LN(TAN(RADIANS(p_max_lat)) + 1 / COS(RADIANS(p_max_lat))) / PI()) / 2 * POWER(2, p_z))
    AND th.y <= FLOOR((1 - LN(TAN(RADIANS(p_min_lat)) + 1 / COS(RADIANS(p_min_lat))) / PI()) / 2 * POWER(2, p_z));
END;
$$ LANGUAGE plpgsql;

-- 8. Функция для очистки старых тайлов (выполнять раз в неделю)
CREATE OR REPLACE FUNCTION cleanup_old_tiles()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM tiles_hourly 
  WHERE day < CURRENT_DATE - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 9. RLS политики (если нужно)
ALTER TABLE tiles_hourly ENABLE ROW LEVEL SECURITY;

-- Разрешаем чтение всем аутентифицированным пользователям
CREATE POLICY "Allow read access to tiles" ON tiles_hourly
  FOR SELECT USING (true);

-- Разрешаем запись только сервисным ролям
CREATE POLICY "Allow write access to service role" ON tiles_hourly
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Allow update access to service role" ON tiles_hourly
  FOR UPDATE USING (auth.role() = 'service_role');

-- 10. Создание представления для мониторинга
CREATE OR REPLACE VIEW tiles_stats AS
SELECT 
  day,
  hour,
  z,
  COUNT(*) as tiles_count,
  SUM(LENGTH(data)) as total_size_bytes,
  AVG(LENGTH(data)) as avg_size_bytes
FROM tiles_hourly
WHERE day >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY day, hour, z
ORDER BY day DESC, hour DESC, z;

-- 11. Функция для получения статистики тайлов
CREATE OR REPLACE FUNCTION get_tiles_stats()
RETURNS TABLE (
  day DATE,
  hour INTEGER,
  z INTEGER,
  tiles_count BIGINT,
  total_size_bytes BIGINT,
  avg_size_bytes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM tiles_stats;
END;
$$ LANGUAGE plpgsql;

