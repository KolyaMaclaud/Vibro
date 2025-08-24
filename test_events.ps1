# Тест функций событий
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Y3dkYXNzbGh2a2R1bHF3enRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NDU0MzQsImV4cCI6MjA3MTEyMTQzNH0.olNpZvqAU5XQbP8Owy1fCl0oCZaVIPXUH89"

Write-Host "Testing OPTIONS (preflight)..." -ForegroundColor Green

# Тест preflight
try {
    $response = Invoke-WebRequest -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event" -Method OPTIONS -Headers @{
        "Origin" = "http://localhost:5500"
        "Access-Control-Request-Method" = "POST"
    }
    Write-Host "✅ OPTIONS success: Status $($response.StatusCode)" -ForegroundColor Green
    Write-Host "  CORS headers: $($response.Headers['Access-Control-Allow-Origin'])" -ForegroundColor Yellow
} catch {
    Write-Host "❌ OPTIONS failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTesting add-event function..." -ForegroundColor Green

# Тест добавления события
$addEventBody = @{
    lat = 55.7558
    lng = 37.6176
    client_id = "test-client-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event" -Method POST -Body $addEventBody -ContentType "application/json" -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "apikey" = $ANON_KEY
    }
    Write-Host "✅ Add event success: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "❌ Add event failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTesting rate limit (should fail)..." -ForegroundColor Green

# Тест rate limit - повторная отправка с тем же client_id
try {
    $response = Invoke-RestMethod -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event" -Method POST -Body $addEventBody -ContentType "application/json" -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "apikey" = $ANON_KEY
    }
    Write-Host "❌ Rate limit test failed - should have returned 429" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 429) {
        Write-Host "✅ Rate limit working correctly: 429 Too Many Requests" -ForegroundColor Green
    } else {
        Write-Host "❌ Rate limit test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nTesting get-events function..." -ForegroundColor Green

# Тест получения событий
try {
    $response = Invoke-RestMethod -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/get-events?hours=24&limit=10" -Method GET -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "apikey" = $ANON_KEY
    }
    Write-Host "✅ Get events success: Found $($response.count) events" -ForegroundColor Green
    if ($response.events) {
        $response.events | ForEach-Object {
            Write-Host "  - Event: lat=$($_.lat), lng=$($_.lng), created=$($_.created_at)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "❌ Get events failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTest completed!" -ForegroundColor Cyan
