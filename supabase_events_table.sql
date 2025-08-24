-- Создание таблицы для отметок на карте
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  level smallint,
  client_id text not null
);

-- Ускорим частые выборки по времени
create index if not exists events_created_at_idx on public.events (created_at desc);

-- Индекс для выборки по client_id (для антиспама)
create index if not exists events_client_id_idx on public.events (client_id);

-- Индекс для выборки по координатам (для отображения на карте)
create index if not exists events_coords_idx on public.events (lat, lng);

-- Проверка создания таблицы
select 'Table events created successfully' as status;
