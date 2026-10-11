param([string]$Action = 'list', [string]$Ids = '')
# AYRA's music manners (bridge/media.mjs): pause whatever is playing while she
# listens, and resume exactly what she paused. Windows' own media controls
# (the ones behind the volume flyout), so Spotify, browsers and video apps alike.
# ASCII only: Windows PowerShell 5.1 reads scripts in the system code page.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [type]$t) {
  $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op))
  if (-not $task.Wait(3000)) { throw 'timed out' }
  $task.Result
}
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$wanted = @($Ids.Split('|') | Where-Object { $_ })
$done = @()
# The owner's own commands ("play the music", "next song") act on the session
# Windows shows in the volume flyout - the one they last used.
if ($Action -in @('play', 'next', 'prev')) {
  $s = $manager.GetCurrentSession()
  if ($s) {
    $op = switch ($Action) { 'play' { $s.TryPlayAsync() } 'next' { $s.TrySkipNextAsync() } 'prev' { $s.TrySkipPreviousAsync() } }
    if (Await $op ([bool])) { $done += $s.SourceAppUserModelId }
  }
  $done -join '|'
  exit
}
foreach ($s in $manager.GetSessions()) {
  $id = $s.SourceAppUserModelId
  $status = [string]$s.GetPlaybackInfo().PlaybackStatus
  if ($Action -eq 'list') { $done += "$id=$status" }
  elseif ($Action -eq 'pause' -and $status -eq 'Playing') {
    if (Await ($s.TryPauseAsync()) ([bool])) { $done += $id }
  }
  elseif ($Action -eq 'resume' -and $wanted -contains $id -and $status -eq 'Paused') {
    if (Await ($s.TryPlayAsync()) ([bool])) { $done += $id }
  }
}
$done -join '|'
