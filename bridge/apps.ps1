using namespace System.Windows.Automation

# Her hands in Windows apps - the worker behind bridge/apps.mjs.
#
# One long-lived PowerShell process, started on AYRA's first app action and
# closed when idle: loading UI Automation costs about a second, so paying it
# once keeps every later call quick. Requests arrive as one JSON line each on
# stdin; answers leave the same way on stdout, and nothing else may be written
# there. Whether an action needs the owner's Approve is decided in apps.mjs,
# before the request is sent - this file only does what it is told.
#
# Keep this file ASCII: Windows PowerShell 5.1 reads a script without a BOM in
# the local code page.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms, System.Drawing

$utf8 = [System.Text.UTF8Encoding]::new($false)
$stdin = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), $utf8)
$stdout = [System.IO.StreamWriter]::new([Console]::OpenStandardOutput(), $utf8)
$stdout.AutoFlush = $true

# Controls she can press or type in get a ref; plain words are read as text.
$Pressable = @{}
foreach ($t in @([ControlType]::Button, [ControlType]::CheckBox, [ControlType]::ComboBox,
    [ControlType]::Edit, [ControlType]::Document, [ControlType]::Hyperlink, [ControlType]::ListItem,
    [ControlType]::DataItem, [ControlType]::MenuItem, [ControlType]::RadioButton,
    [ControlType]::SplitButton, [ControlType]::TabItem, [ControlType]::TreeItem,
    [ControlType]::Slider, [ControlType]::Spinner)) { $Pressable[$t.Id] = $true }
$Wording = @{}
foreach ($t in @([ControlType]::Text, [ControlType]::Header, [ControlType]::HeaderItem)) { $Wording[$t.Id] = $true }

# Everything a read needs, fetched from the app in one cross-process call
# rather than one call per property per control.
$ReadCache = [CacheRequest]::new()
foreach ($p in @([AutomationElement]::NameProperty, [AutomationElement]::ControlTypeProperty,
    [AutomationElement]::LocalizedControlTypeProperty, [AutomationElement]::AutomationIdProperty,
    [AutomationElement]::IsOffscreenProperty, [AutomationElement]::IsEnabledProperty,
    [AutomationElement]::IsPasswordProperty, [ValuePattern]::ValueProperty,
    [TogglePattern]::ToggleStateProperty, [SelectionItemPattern]::IsSelectedProperty)) { $ReadCache.Add($p) }
$ReadCache.TreeScope = [TreeScope]::Subtree
$ReadCache.TreeFilter = [Automation]::ControlViewCondition

# How a click is done, in order of preference: through the control itself,
# which needs no mouse and no window in front. A real mouse click is the
# fallback for controls that offer none of these.
$ClickPatterns = [ordered]@{
  invoke = [InvokePattern]::Pattern
  toggle = [TogglePattern]::Pattern
  select = [SelectionItemPattern]::Pattern
  expand = [ExpandCollapsePattern]::Pattern
}

# Runs in a runspace of its own: a button that opens a modal dialog does not
# return from Invoke() until the dialog closes, and that must not block her.
$DoPattern = @'
param($a)
$ErrorActionPreference = 'Stop'
switch ($a.kind) {
  'invoke' { $a.p.Invoke() }
  'toggle' { $a.p.Toggle() }
  'select' { $a.p.Select() }
  'expand' { if ("$($a.p.Current.ExpandCollapseState)" -eq 'Expanded') { $a.p.Collapse() } else { $a.p.Expand() } }
  'close' { $a.p.Close() }
}
'@

$script:refs = @{}
$script:refWindow = $null
$script:names = @{}
$script:startApps = $null
$script:win32 = $null

# Window focus and the mouse are not in UI Automation; compiled on first use.
function Win32 {
  if (-not $script:win32) {
    Add-Type -Namespace Ayra -Name Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from, uint to, bool attach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
'@
    $script:win32 = [Ayra.Win32]
    # UI Automation reports real pixels; the mouse must move in them too.
    [void]$script:win32::SetProcessDPIAware()
  }
  $script:win32
}

function Shorten([string]$s, [int]$max) {
  if ($s.Length -gt $max) { $s.Substring(0, $max) + '...' } else { $s }
}

function ProcName([int]$id) {
  if (-not $script:names.ContainsKey($id)) {
    $script:names[$id] = try { [System.Diagnostics.Process]::GetProcessById($id).ProcessName } catch { '' }
  }
  $script:names[$id]
}

function Describe-Window($w) {
  $c = $w.Current
  @{ id = $c.NativeWindowHandle; title = $c.Name; app = ProcName $c.ProcessId }
}

# The windows on screen (and minimised), without the taskbar and desktop.
function Get-TopWindows {
  $all = [AutomationElement]::RootElement.FindAll([TreeScope]::Children, [Condition]::TrueCondition)
  foreach ($w in $all) {
    $c = $w.Current
    if (-not $c.Name -or $c.ClassName -in @('Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Progman', 'WorkerW')) { continue }
    $w
  }
}

# A window by its id from the list, or by part of its title or app name.
function Find-Window($which) {
  $s = "$which".Trim()
  if (-not $s) { throw 'Say which window: its id from the list, or part of its title.' }
  if ($s -match '^\d+$') {
    try { return [AutomationElement]::FromHandle([IntPtr][int64]$s) } catch { }
  }
  $best = $null
  foreach ($w in Get-TopWindows) {
    $c = $w.Current
    if ($c.Name -eq $s) { return $w }
    if (-not $best -and ($c.Name.IndexOf($s, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or (ProcName $c.ProcessId) -eq $s)) { $best = $w }
  }
  if ($best) { return $best }
  throw "No open window matches '$s'. List the windows to see what is open."
}

# The top-level window an element belongs to.
function Top-Of($el) {
  $walker = [TreeWalker]::ControlViewWalker
  $root = [AutomationElement]::RootElement
  $cur = $el
  while ($true) {
    $parent = $walker.GetParent($cur)
    if (-not $parent -or [Automation]::Compare($parent, $root)) { return $cur }
    $cur = $parent
  }
}

# Brings a window to the front, restoring it if minimised. Windows lets only
# the app in front hand over the focus, so she borrows its input queue for
# the moment it takes.
function Show-Window($win) {
  $wp = $null
  if ($win.TryGetCurrentPattern([WindowPattern]::Pattern, [ref]$wp) -and "$($wp.Current.WindowVisualState)" -eq 'Minimized') {
    $wp.SetWindowVisualState([WindowVisualState]::Normal)
  }
  $h = [IntPtr]$win.Current.NativeWindowHandle
  $w = Win32
  $front = $w::GetForegroundWindow()
  if ($front -eq $h) { return }
  $me = $w::GetCurrentThreadId()
  $them = $w::GetWindowThreadProcessId($front, [IntPtr]::Zero)
  [void]$w::AttachThreadInput($me, $them, $true)
  [void]$w::SetForegroundWindow($h)
  [void]$w::BringWindowToTop($h)
  [void]$w::AttachThreadInput($me, $them, $false)
  Start-Sleep -Milliseconds 60
}

# Runs a pattern action off this thread; false if it is still going after
# waitMs (a dialog opened and is waiting for the owner).
function Invoke-Soon($arg, [int]$waitMs = 3000) {
  $ps = [PowerShell]::Create()
  [void]$ps.AddScript($DoPattern).AddArgument($arg)
  $async = $ps.BeginInvoke()
  if (-not $async.AsyncWaitHandle.WaitOne($waitMs)) { return $false }
  try {
    [void]$ps.EndInvoke($async)
    if ($ps.Streams.Error.Count) { throw $ps.Streams.Error[0].Exception }
  } finally { $ps.Dispose() }
  $true
}

function Get-Ref($ref) {
  $el = $script:refs[[int]$ref]
  if (-not $el) { throw "There is no ref $ref - read the window again." }
  $el
}

# SendKeys treats + ^ % ~ ( ) { } [ ] as commands. A new line is Shift+Enter:
# a line break in a document, and never "send" in a chat box.
function ConvertTo-Keys([string]$text) {
  $sb = [System.Text.StringBuilder]::new()
  foreach ($ch in $text.Replace("`r`n", "`n").ToCharArray()) {
    if ($ch -eq [char]10) { [void]$sb.Append('+{ENTER}') }
    elseif ($ch -eq [char]9) { [void]$sb.Append('{TAB}') }
    elseif ('+^%~(){}[]'.IndexOf($ch) -ge 0) { [void]$sb.Append('{').Append($ch).Append('}') }
    else { [void]$sb.Append($ch) }
  }
  $sb.ToString()
}

function Op-List {
  $out = [System.Collections.Generic.List[object]]::new()
  foreach ($w in Get-TopWindows) {
    $d = Describe-Window $w
    $d.minimized = $w.Current.IsOffscreen
    $out.Add($d)
  }
  @{ windows = $out }
}

function Op-Read($req) {
  $win = Find-Window $req.window
  $tree = $win.GetUpdatedCache($ReadCache)
  $script:refs = @{}
  $script:refWindow = $win
  $items = [System.Collections.Generic.List[object]]::new()
  $stack = [System.Collections.Generic.Stack[object]]::new()
  $stack.Push($tree)
  $n = 0; $seen = 0; $docs = 0; $more = $false; $last = $null
  $none = [AutomationElement]::NotSupported
  while ($stack.Count -gt 0) {
    $el = $stack.Pop()
    $seen++
    if ($seen -gt 4000 -or $items.Count -ge 400) { $more = $true; break }
    $c = $el.Cached
    # Some controls (File Explorer has a few) report no type at all.
    $tid = if ($c.ControlType) { $c.ControlType.Id } else { -1 }
    # The minimise / maximise / close buttons; closing is apps_close.
    if ($tid -eq [ControlType]::TitleBar.Id) { continue }
    if (-not $c.IsOffscreen) {
      $name = ($c.Name -replace '\s+', ' ').Trim()
      if ($Pressable.ContainsKey($tid)) {
        $n++
        $script:refs[$n] = $el
        $item = [ordered]@{ ref = $n; type = $c.LocalizedControlType; name = (Shorten $name 120) }
        $isDoc = $tid -eq [ControlType]::Document.Id
        if ($c.IsPassword) { $item.password = $true }
        elseif ($tid -eq [ControlType]::Edit.Id -or $isDoc) {
          $item.aid = $c.AutomationId
          $v = $el.GetCachedPropertyValue([ValuePattern]::ValueProperty, $true)
          if (-not [object]::ReferenceEquals($v, $none) -and "$v") {
            $item.value = Shorten "$v" $(if ($isDoc) { 3000 } else { 300 })
          } elseif ($isDoc -and $docs -lt 2) {
            $docs++
            $tp = $null
            if ($el.TryGetCurrentPattern([TextPattern]::Pattern, [ref]$tp)) {
              $item.value = Shorten ($tp.DocumentRange.GetText(3001)) 3000
            }
          }
        }
        $ts = $el.GetCachedPropertyValue([TogglePattern]::ToggleStateProperty, $true)
        if (-not [object]::ReferenceEquals($ts, $none)) { $item.state = "$ts".ToLower() }
        $sel = $el.GetCachedPropertyValue([SelectionItemPattern]::IsSelectedProperty, $true)
        if ($sel -eq $true) { $item.state = 'selected' }
        if (-not $c.IsEnabled) { $item.disabled = $true }
        $items.Add($item)
        $last = $name
      } elseif ($name -and $Wording.ContainsKey($tid) -and $name -ne $last) {
        $items.Add(@{ text = (Shorten $name 400) })
        $last = $name
      }
    }
    $kids = $el.CachedChildren
    if ($kids) { for ($i = $kids.Count - 1; $i -ge 0; $i--) { $stack.Push($kids[$i]) } }
  }
  @{ window = (Describe-Window $win); items = $items; more = $more }
}

function Op-Open($req) {
  if (-not $script:startApps) { $script:startApps = @(Get-StartApps) }
  $q = "$($req.name)".Trim()
  $hit = $script:startApps | Where-Object { $_.Name -eq $q } | Select-Object -First 1
  if (-not $hit) {
    $hit = $script:startApps | Where-Object { $_.Name.StartsWith($q, [StringComparison]::OrdinalIgnoreCase) } |
      Sort-Object { $_.Name.Length } | Select-Object -First 1
  }
  if (-not $hit) {
    $hit = $script:startApps | Where-Object { $_.Name.IndexOf($q, [StringComparison]::OrdinalIgnoreCase) -ge 0 } |
      Sort-Object { $_.Name.Length } | Select-Object -First 1
  }
  if (-not $hit) { throw "No app called '$q' in the Start menu." }

  $before = @{}
  foreach ($w in Get-TopWindows) { $before[$w.Current.NativeWindowHandle] = $true }
  Start-Process explorer.exe "shell:AppsFolder\$($hit.AppID)"
  # A new window means it opened; an app that allows only one window (Settings,
  # Calculator...) comes to the front in the one it has.
  $started = Get-Date
  while (((Get-Date) - $started).TotalSeconds -lt 10) {
    Start-Sleep -Milliseconds 250
    $elapsed = ((Get-Date) - $started).TotalSeconds
    foreach ($w in Get-TopWindows) {
      $c = $w.Current
      $new = -not $before.ContainsKey($c.NativeWindowHandle)
      if ($new -or ($elapsed -gt 2 -and $c.Name.IndexOf($hit.Name, [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
        Start-Sleep -Milliseconds 500
        return @{ app = $hit.Name; window = (Describe-Window $w) }
      }
    }
  }
  @{ app = $hit.Name; window = $null }
}

function Op-Focus($req) {
  $win = Find-Window $req.window
  Show-Window $win
  @{ window = (Describe-Window $win) }
}

# What has the keyboard focus, and in which window: Enter's risk depends on it.
function Op-Focused {
  $el = [AutomationElement]::FocusedElement
  $c = $el.Current
  @{ name = $c.Name; type = $c.LocalizedControlType; aid = $c.AutomationId; password = $c.IsPassword; window = (Describe-Window (Top-Of $el)) }
}

function Op-Click($req) {
  $el = Get-Ref $req.ref
  foreach ($k in $ClickPatterns.GetEnumerator()) {
    $p = $null
    if ($el.TryGetCurrentPattern($k.Value, [ref]$p)) {
      $done = Invoke-Soon @{ kind = $k.Key; p = $p }
      return @{ how = $k.Key; waiting = (-not $done) }
    }
  }
  Show-Window $script:refWindow
  $w = Win32
  [System.Windows.Point]$pt = [System.Windows.Point]::new(0, 0)
  if (-not $el.TryGetClickablePoint([ref]$pt)) {
    $r = $el.Current.BoundingRectangle
    if ($r.IsEmpty) { throw 'That control has no place on screen to click.' }
    $pt = [System.Windows.Point]::new($r.X + $r.Width / 2, $r.Y + $r.Height / 2)
  }
  [void]$w::SetCursorPos([int]$pt.X, [int]$pt.Y)
  $w::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  $w::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  @{ how = 'mouse'; waiting = $false }
}

function Op-Type($req) {
  $text = "$($req.text)"
  if ($req.ref) { $el = Get-Ref $req.ref; $win = $script:refWindow }
  else { $el = [AutomationElement]::FocusedElement; $win = Top-Of $el }
  $isDoc = $el.Current.ControlType.Id -eq [ControlType]::Document.Id
  # A box is filled in; a document is added to.
  $replace = if ($null -ne $req.replace) { [bool]$req.replace } else { -not $isDoc }
  $vp = $null
  if ($el.TryGetCurrentPattern([ValuePattern]::Pattern, [ref]$vp) -and -not $vp.Current.IsReadOnly) {
    $vp.SetValue($(if ($replace) { $text } else { $vp.Current.Value + $text }))
    return @{ how = 'value' }
  }
  Show-Window $win
  try { $el.SetFocus() } catch { }
  $start = if ($replace) { '^a{DELETE}' } else { '^{END}' }
  [System.Windows.Forms.SendKeys]::SendWait($start + (ConvertTo-Keys $text))
  @{ how = 'keys' }
}

function Op-Keys($req) {
  if ($req.window) { Show-Window (Find-Window $req.window) }
  [System.Windows.Forms.SendKeys]::SendWait("$($req.keys)")
  @{ done = $true }
}

# A picture of a window, even one behind others or on a display that is off:
# PrintWindow asks the window to draw itself (PW_RENDERFULLCONTENT, 2, for
# browsers and modern apps). JPEG, at most 1400 px wide.
function Op-Shot($req) {
  $win = Find-Window $req.window
  $w = Win32
  $wp = $null
  if ($win.TryGetCurrentPattern([WindowPattern]::Pattern, [ref]$wp) -and "$($wp.Current.WindowVisualState)" -eq 'Minimized') {
    throw 'That window is minimised - bring it to the front first.'
  }
  $c = $win.Current
  $r = $c.BoundingRectangle
  if ($r.IsEmpty -or $r.Width -lt 2 -or $r.Height -lt 2) { throw 'That window has no size to picture.' }
  $bmp = [System.Drawing.Bitmap]::new([int]$r.Width, [int]$r.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $ok = $w::PrintWindow([IntPtr]$c.NativeWindowHandle, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $g.Dispose()
  if (-not $ok) { $bmp.Dispose(); throw 'Windows would not draw that window.' }
  $out = $bmp
  if ($bmp.Width -gt 1400) {
    $h = [int]($bmp.Height * 1400 / $bmp.Width)
    $out = [System.Drawing.Bitmap]::new(1400, $h)
    $g2 = [System.Drawing.Graphics]::FromImage($out)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.DrawImage($bmp, 0, 0, 1400, $h)
    $g2.Dispose()
    $bmp.Dispose()
  }
  $ms = [System.IO.MemoryStream]::new()
  $out.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $out.Dispose()
  @{ window = (Describe-Window $win); jpeg = [Convert]::ToBase64String($ms.ToArray()) }
}

function Op-Close($req) {
  $win = Find-Window $req.window
  $d = Describe-Window $win
  $wp = $null
  if (-not $win.TryGetCurrentPattern([WindowPattern]::Pattern, [ref]$wp)) { throw 'That window cannot be closed this way.' }
  $done = Invoke-Soon @{ kind = 'close'; p = $wp } 2000
  @{ window = $d; waiting = (-not $done) }
}

while ($null -ne ($line = $stdin.ReadLine())) {
  if (-not $line.Trim()) { continue }
  $id = $null
  try {
    $req = ConvertFrom-Json $line
    $id = $req.id
    $data = switch ($req.op) {
      'ping' { @{ pong = $true } }
      'list' { Op-List }
      'read' { Op-Read $req }
      'open' { Op-Open $req }
      'focus' { Op-Focus $req }
      'describe' { @{ window = (Describe-Window (Find-Window $req.window)) } }
      'shot' { Op-Shot $req }
      'focused' { Op-Focused }
      'click' { Op-Click $req }
      'type' { Op-Type $req }
      'keys' { Op-Keys $req }
      'close' { Op-Close $req }
      default { throw "Unknown request '$($req.op)'." }
    }
    $stdout.WriteLine((ConvertTo-Json -InputObject @{ id = $id; ok = $true; data = $data } -Compress -Depth 8))
  } catch {
    $msg = $_.Exception.GetBaseException().Message
    $stdout.WriteLine((ConvertTo-Json -InputObject @{ id = $id; ok = $false; error = $msg } -Compress -Depth 3))
  }
}
