# === Конфигурация ===
$ANON_KEY ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Y3dkYXNzbGh2a2R1bHF3enRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NDU0MzQsImV4cCI6MjA3MTEyMTQzNH0.olNpZvqAU5XQbP8Owy1fCl0oCZaVIPXUH89PP8kwNPk"
$URL = "https://ttcwdasslhvkduqwzte.functions.supabase.co"

Write-Host "ANON_KEY length:" $ANON_KEY.Length
Write-Host "URL:" $URL

# === 1. Вызов функции generate-tiles-hourly ===
Write-Host "`n--- Запрос: generate-tiles-hourly ---"
$resp1 = curl.exe -s -X POST `
  -H "Authorization: Bearer $ANON_KEY" `
  -H "apikey: $ANON_KEY" `
  "$URL/functions/v1/generate-tiles-hourly"

Write-Host $resp1

# === 2. Вызов функции get-tiles ===
Write-Host "`n--- Запрос: get-tiles ---"
$resp2 = curl.exe -s `
  -H "Authorization: Bearer $ANON_KEY" `
  -H "apikey: $ANON_KEY" `
  "$URL/functions/v1/get-tiles?z=0&x=0&y=0"

Write-Host $resp2
