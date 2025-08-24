-- Функция для проверки rate limit
CREATE OR REPLACE FUNCTION check_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Проверяем, есть ли события от этого client_id за последние 30 секунд
  IF EXISTS (
    SELECT 1 FROM events 
    WHERE client_id = NEW.client_id 
    AND created_at > NOW() - INTERVAL '30 seconds'
    AND id != NEW.id  -- Исключаем текущую запись
  ) THEN
    RAISE EXCEPTION 'RATE_LIMIT: Too many requests from this client_id';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер
DROP TRIGGER IF EXISTS rate_limit_trigger ON events;
CREATE TRIGGER rate_limit_trigger
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION check_rate_limit();

-- Проверка создания триггера
SELECT 'Rate limit trigger created successfully' as status;
