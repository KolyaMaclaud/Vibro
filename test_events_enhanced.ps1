# Улучшенный тест функций событий
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Y3dkYXNzbGh2a2R1bHF3enRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NDU0MzQsImV4cCI6MjA3MTEyMTQzNH0.olNpZvqAU5XQbP8Owy1fCl0oCZaVIPXUH89"

Write-Host "=== Улучшенный тест системы событий ===" -ForegroundColor Cyan
Write-Host ""

# 1. Тест OPTIONS (preflight)
Write-Host "1. Тестирование OPTIONS (preflight)..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event" -Method OPTIONS -Headers @{
        "Origin" = "http://localhost:5500"
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "authorization,apikey,content-type"
    }
    Write-Host "✅ OPTIONS success: Status $($response.StatusCode)" -ForegroundColor Green
    Write-Host "  CORS headers:" -ForegroundColor Yellow
    Write-Host "    Access-Control-Allow-Origin: $($response.Headers['Access-Control-Allow-Origin'])" -ForegroundColor Yellow
    Write-Host "    Access-Control-Allow-Methods: $($response.Headers['Access-Control-Allow-Methods'])" -ForegroundColor Yellow
    Write-Host "    Access-Control-Allow-Headers: $($response.Headers['Access-Control-Allow-Headers'])" -ForegroundColor Yellow
} catch {
    Write-Host "❌ OPTIONS failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 2. Тест успешного добавления события
Write-Host "2. Тестирование успешного добавления события..." -ForegroundColor Green
$testClientId = "test-client-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$addEventBody = @{
    lat = 55.7558
    lng = 37.6176
    client_id = $testClientId
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event" -Method POST -Body $addEventBody -ContentType "application/json" -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "apikey" = $ANON_KEY
    }
    Write-Host "✅ Add event success: $($response | ConvertTo-Json)" -ForegroundColor Green
    $firstEventId = $response.id
} catch {
    Write-Host "❌ Add event failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 3. Тест rate limit (должен вернуть 429)
Write-Host "3. Тестирование rate limit (ожидается 429)..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event" -Method POST -Body $addEventBody -ContentType "application/json" -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "apikey" = $ANON_KEY
    }
    Write-Host "❌ Rate limit test failed - should have returned 429" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 429) {
        Write-Host "✅ Rate limit working correctly: 429 Too Many Requests" -ForegroundColor Green
        try {
            $errorResponse = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorResponse)
            $errorBody = $reader.ReadToEnd()
            $errorJson = $errorBody | ConvertFrom-Json
            Write-Host "  Error message: $($errorJson.error)" -ForegroundColor Yellow
        } catch {
            Write-Host "  Could not parse error response" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Rate limit test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# 4. Тест получения событий
Write-Host "4. Тестирование получения событий..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/get-events?hours=24&limit=10" -Method GET -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "apikey" = $ANON_KEY
    }
    Write-Host "✅ Get events success: Found $($response.count) events" -ForegroundColor Green
    if ($response.events) {
        $response.events | ForEach-Object {
            $age = [DateTime]::Now - [DateTime]::Parse($_.created_at)
            Write-Host "  - Event: lat=$($_.lat), lng=$($_.lng), age=$([math]::Round($age.TotalMinutes, 1))min" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "❌ Get events failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 5. Тест с неправильными координатами
Write-Host "5. Тестирование с неправильными координатами..." -ForegroundColor Green
$invalidBody = @{
    lat = 999.0  # Неправильная широта
    lng = 37.6176
    client_id = "test-invalid-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event" -Method POST -Body $invalidBody -ContentType "application/json" -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "apikey" = $ANON_KEY
    }
    Write-Host "❌ Invalid coordinates test failed - should have returned 400" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "✅ Invalid coordinates correctly rejected: 400 Bad Request" -ForegroundColor Green
    } else {
        Write-Host "❌ Invalid coordinates test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# 6. Тест без авторизации
Write-Host "6. Тестирование без авторизации..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event" -Method POST -Body $addEventBody -ContentType "application/json"
    Write-Host "❌ No auth test failed - should have returned 401" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "✅ No auth correctly rejected: 401 Unauthorized" -ForegroundColor Green
    } else {
        Write-Host "❌ No auth test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Тест завершен ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Для тестирования в браузере:" -ForegroundColor Yellow
Write-Host "1. Откройте http://localhost:5500/vibro.html" -ForegroundColor White
Write-Host "2. Завершите медитацию" -ForegroundColor White
Write-Host "3. Переключитесь на Light или Dark карту" -ForegroundColor White
Write-Host "4. Попробуйте долгое нажатие (0.5 сек) на карте" -ForegroundColor White
Write-Host "5. Проверьте консоль браузера на ошибки" -ForegroundColor White
