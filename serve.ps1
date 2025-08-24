# serve.ps1 — простой статический сервер на PowerShell
param([int]$Port = 5500)

Add-Type -AssemblyName System.Net.HttpListener
$h = New-Object System.Net.HttpListener
$h.Prefixes.Add("http://localhost:$Port/")
$h.Start()
Write-Host "Serving http://localhost:$Port from $pwd  (Ctrl+C to stop)"

while ($h.IsListening) {
  $ctx  = $h.GetContext()
  $rel  = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ([string]::IsNullOrEmpty($rel)) { $rel = "tiles-demo.html" }
  $file = Join-Path $pwd $rel

  if (!(Test-Path $file)) { $ctx.Response.StatusCode = 404; $ctx.Response.Close(); continue }

  $bytes = [IO.File]::ReadAllBytes($file)
  $ext   = [IO.Path]::GetExtension($file).ToLower()
  $ct    = switch ($ext) {
            ".html" { "text/html" }
            ".js"   { "application/javascript" }
            ".css"  { "text/css" }
            ".png"  { "image/png" }
            default { "application/octet-stream" } }
  $ctx.Response.ContentType = $ct
  $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
  $ctx.Response.Close()
}
