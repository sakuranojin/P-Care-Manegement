# Registers P-CARE-MANAGEMENT and Caddy as boot-time scheduled tasks and opens the firewall.
# Run as Administrator:  powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\.."
New-Item -ItemType Directory -Force "$root\data" | Out-Null

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtStartup

$app = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$root\deploy\windows\start-app.cmd`"" -WorkingDirectory $root
Register-ScheduledTask -TaskName 'P-CARE-MANAGEMENT App' -Action $app -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

$caddy = New-ScheduledTaskAction -Execute 'C:\caddy\caddy.exe' -Argument "run --config `"$root\deploy\windows\Caddyfile`" --adapter caddyfile" -WorkingDirectory 'C:\caddy'
Register-ScheduledTask -TaskName 'P-CARE-MANAGEMENT Caddy' -Action $caddy -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

foreach ($port in 80, 443) {
  if (-not (Get-NetFirewallRule -DisplayName "P-CARE-MANAGEMENT $port" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "P-CARE-MANAGEMENT $port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
  }
}

Start-ScheduledTask -TaskName 'P-CARE-MANAGEMENT App'
Start-ScheduledTask -TaskName 'P-CARE-MANAGEMENT Caddy'
Write-Host 'Installed. https://p-care-management.103-179-45-80.sslip.io'
