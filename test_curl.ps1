# Тест add-event функции через curl
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Y3dkYXNzbGh2a2R1bHF3enRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NDU0MzQsImV4cCI6MjA3MTEyMTQzNH0.olNpZvqAU5XQbP8Owy1fCl0oCZaVIPXUH89"
$URL = "https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event"

Write-Host "Testing add-event function with curl..." -ForegroundColor Green

$body = @{
    lat = 55.75
    lng = 37.62
    client_id = "curl-test-$(Get-Date -Format 'HHmmss')"
} | ConvertTo-Json

Write-Host "URL: $URL" -ForegroundColor Yellow
Write-Host "Body: $body" -ForegroundColor Yellow
Write-Host "ANON_KEY: $ANON_KEY" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $URL -Method POST -Body $body -ContentType "application/json" -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "apikey" = $ANON_KEY
    }
    Write-Host "✅ Success: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response body: $responseBody" -ForegroundColor Yellow
        } catch {
            Write-Host "Could not read response body" -ForegroundColor Yellow
        }
    }
}
