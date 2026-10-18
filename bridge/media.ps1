param([string]$Action = 'list', [string]$Ids = '', [string]$Skip = '')
# AYRA's music manners (bridge/media.mjs): pause whatever is playing while she
# listens, and resume exactly what she paused. Windows' own media controls
# (the ones behind the volume flyout), so Spotify, browsers and video apps alike.
# ASCII only: Windows PowerShell 5.1 reads scripts in the system code page.
$ErrorActionPreference = 'Stop'
# The volume keys, before anything slow loads: up or down five steps, or mute.
if ($Action -in @('volup', 'voldown', 'mute')) {
  Add-Type -Namespace AyraMedia -Name Keys -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);'
  $vk = switch ($Action) { 'volup' { 0xAF } 'voldown' { 0xAE } 'mute' { 0xAD } }
  $times = if ($Action -eq 'mute') { 1 } else { 5 }
  for ($i = 0; $i -lt $times; $i++) {
    [AyraMedia.Keys]::keybd_event([byte]$vk, 0, 0, [System.UIntPtr]::Zero)
    [AyraMedia.Keys]::keybd_event([byte]$vk, 0, 2, [System.UIntPtr]::Zero)
  }
  $Action
  exit
}
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
# Sessions never to pause: her own window (it plays her voice and her chimes).
$skipped = @($Skip.Split('|') | Where-Object { $_ })
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
  elseif ($Action -eq 'pause' -and $status -eq 'Playing' -and -not ($skipped -contains $id)) {
    if (Await ($s.TryPauseAsync()) ([bool])) { $done += $id }
  }
  elseif ($Action -eq 'resume' -and $wanted -contains $id -and $status -eq 'Paused') {
    if (Await ($s.TryPlayAsync()) ([bool])) { $done += $id }
  }
}
$done -join '|'
