import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, origin',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders 
    })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Get query parameters
    const url = new URL(req.url)
    const hours = parseInt(url.searchParams.get('hours') || '24')
    const limit = parseInt(url.searchParams.get('limit') || '100')

    // Calculate time range
    const now = new Date()
    const timeRange = new Date(now.getTime() - hours * 60 * 60 * 1000)

    // Get events from the last N hours
    const { data: events, error } = await supabaseClient
      .from('events')
      .select('id, lat, lng, created_at, client_id, level')
      .gte('created_at', timeRange.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Query error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch events' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        events: events || [],
        count: events?.length || 0
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
