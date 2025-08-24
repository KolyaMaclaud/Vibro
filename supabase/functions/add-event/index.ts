import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    // (1) Авторизация (принимаем anon key)
    const auth = req.headers.get("authorization") ?? "";
    const apikey = req.headers.get("apikey") ?? "";
    if (!auth.startsWith("Bearer ") || !apikey) {
      return json({ ok: false, error: "Missing Authorization/apikey" }, 401);
    }

    // (2) Парсинг
    const { lat, lng, client_id, level } = await req.json();

    // (3) Валидация
    if (
      typeof lat !== "number" || typeof lng !== "number" ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) {
      return json({ ok: false, error: "Bad coordinates" }, 400);
    }
    const cid = (client_id ?? "").toString().trim();
    if (!cid) return json({ ok: false, error: "Missing client_id" }, 400);

    // (4) Создаем Supabase клиент
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // (5) Вставка (триггер защищает от спама)
    const { data, error } = await supabaseClient
      .from('events')
      .insert([{ lat, lng, client_id: cid, level: level ?? null }])
      .select('id, created_at')
      .single();

    if (error) {
      // Распознаём наш триггер по сообщению
      if (error.message && error.message.includes('RATE_LIMIT')) {
        return json({ ok: false, error: 'Too many requests' }, 429);
      }
      return json({ ok: false, error: String(error.message || error) }, 400);
    }

    return json({ ok: true, id: data.id, created_at: data.created_at }, 200);
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    if (msg.includes('RATE_LIMIT')) {
      return json({ ok: false, error: 'Too many requests' }, 429);
    }
    return json({ ok: false, error: msg }, 500);
  }
});
