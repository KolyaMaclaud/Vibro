import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function decompressTileData(compressedData) {
  const buf = await new Response(compressedData).arrayBuffer();
  const text = new TextDecoder().decode(buf);
  return JSON.parse(text);
}

async function getTile(supabase, day, hour, z, x, y) {
  const { data, error } = await supabase.rpc("get_tile", { p_day: day, p_hour: hour, p_z: z, p_x: x, p_y: y });
  if (error || !data) return null;
  return await decompressTileData(data);
}

async function getVisibleTiles(supabase, z, bounds, day, hour) {
  const { data, error } = await supabase.rpc("get_visible_tiles", {
    p_z: z, p_min_lat: bounds.minLat, p_max_lat: bounds.maxLat,
    p_min_lon: bounds.minLon, p_max_lon: bounds.maxLon, p_day: day, p_hour: hour
  });
  if (error || !data) return [];
  const out = [];
  for (const t of data) {
    try { out.push({ x: t.x, y: t.y, data: await decompressTileData(t.data) }); } catch {}
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const z = parseInt(url.searchParams.get("z") ?? "0");
    const x = parseInt(url.searchParams.get("x") ?? "0");
    const y = parseInt(url.searchParams.get("y") ?? "0");
    const day  = url.searchParams.get("day")  ?? new Date().toISOString().split("T")[0];
    const hour = parseInt(url.searchParams.get("hour") ?? String(new Date().getHours()));
    const bounds = url.searchParams.get("bounds");

    if (z < 0 || z > 10 || x < 0 || y < 0)
      return new Response(JSON.stringify({ error: "Invalid parameters" }), { status: 400, headers: { ...corsHeaders, "Content-Type":"application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

    let result;
    if (bounds) {
      result = await getVisibleTiles(supabase, z, JSON.parse(bounds), day, hour);
    } else {
      const tile = await getTile(supabase, day, hour, z, x, y);
      if (!tile) return new Response(JSON.stringify({ error: "Tile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type":"application/json" } });
      result = { z, x, y, day, hour, data: tile };
    }

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type":"application/json", "Cache-Control":"public, max-age=3600" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal server error", details: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type":"application/json" } });
  }
});