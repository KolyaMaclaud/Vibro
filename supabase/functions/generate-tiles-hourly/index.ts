import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Тут потом вставим реальную генерацию снапшотов (RPC и т.п.)
  return new Response(JSON.stringify({ ok: true, msg: "generate-tiles-hourly stub" }), {
    status: 200, headers: { ...corsHeaders, "Content-Type":"application/json" }
  });
});