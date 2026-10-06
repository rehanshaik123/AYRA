// AYRA on the Windows desktop - AYRA.exe.
//
// A small tray app, and the one part of AYRA that starts with Windows. It
//   - keeps her bridge running in the background, with no console window,
//     and starts it again if it stops;
//   - opens her window (the face, as an app window of "Chrome (AYRA)") from
//     the tray, the taskbar, the desktop or a hotkey - the hotkey also starts
//     a turn, as Space does in her window;
//   - puts that window under AYRA's own taskbar icon rather than Chrome's.
//
// Her access to the laptop lives in the bridge, not here: this app only
// starts, watches and shows. It opens no port and reads no secrets.
//
// Built by `npm run shortcuts` with the C# compiler that ships with Windows
// (.NET Framework 4), so nothing needs installing. Settings come from ayra.ini
// beside the exe, written by the same script. The compiler is C# 5: no
// string interpolation, no ?. and no => members.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace Ayra
{
  static class Program
  {
    // Shared by the exe, its shortcuts and her window, so Windows shows them
    // as one app on the taskbar.
    public const string AppId = "AYRA.Desk";
    public const string QuitEvent = "Local\\AYRA.Desk.Quit";
    public const string OpenEvent = "Local\\AYRA.Desk.Open";

    [STAThread]
    static int Main(string[] args)
    {
      // Before any window: real pixels, so the tray icon is sharp at 125-150%.
      Native.SetProcessDPIAware();
      // Asks the running tray to stop AYRA and close (npm run shortcuts does
      // this with the new build, before it has settings of its own).
      if (Has(args, "--quit")) { Signal(QuitEvent); return 0; }

      Config config;
      try { config = Config.Load(); }
      catch (Exception e) { MessageBox.Show(e.Message, "AYRA"); return 1; }

      Native.SetCurrentProcessExplicitAppUserModelID(AppId);

      if (Has(args, "--install")) return Shortcuts.Install(config, !Has(args, "--no-startup"));

      bool first;
      using (var mutex = new Mutex(true, "Local\\AYRA.Desk", out first))
      {
        if (!first)
        {
          // AYRA is already in the tray; a shortcut click only wants her window.
          // The tray opens it, so quick clicks never make two windows.
          if (!Has(args, "--background")) Signal(OpenEvent);
          return 0;
        }
        Application.EnableVisualStyles();
        var tray = new Tray(config, !Has(args, "--background"));
        Application.Run();
        GC.KeepAlive(tray);
        GC.KeepAlive(mutex);
      }
      return 0;
    }

    static bool Has(string[] args, string flag) { return Array.IndexOf(args, flag) >= 0; }

    static void Signal(string name)
    {
      EventWaitHandle e;
      if (EventWaitHandle.TryOpenExisting(name, out e)) { e.Set(); e.Dispose(); }
    }
  }

  // ayra.ini, written by scripts/shortcuts.mjs: key=value, one per line.
  class Config
  {
    public string Exe, Icon, Root, Node, Chrome, FaceUrl, HealthUrl, Title, Hotkey;
    public List<string> ChromeArgs = new List<string>();

    public static Config Load()
    {
      var exe = Application.ExecutablePath;
      var dir = Path.GetDirectoryName(exe);
      var path = Path.Combine(dir, "ayra.ini");
      if (!File.Exists(path)) throw new Exception("ayra.ini is missing beside AYRA.exe. Run `npm run shortcuts` in the AYRA folder.");
      var c = new Config();
      c.Exe = exe;
      c.Icon = Path.Combine(dir, "ayra.ico");
      c.Hotkey = "ctrl+alt+a";
      foreach (var raw in File.ReadAllLines(path, Encoding.UTF8))
      {
        var line = raw.Trim();
        var eq = line.IndexOf('=');
        if (line.Length == 0 || line[0] == '#' || eq < 1) continue;
        var key = line.Substring(0, eq).Trim();
        var value = line.Substring(eq + 1).Trim();
        switch (key)
        {
          case "root": c.Root = value; break;
          case "node": c.Node = value; break;
          case "chrome": c.Chrome = value; break;
          case "chromeArg": c.ChromeArgs.Add(value); break;
          case "face": c.FaceUrl = value; break;
          case "health": c.HealthUrl = value; break;
          case "title": c.Title = value; break;
          case "hotkey": if (value.Length > 0) c.Hotkey = value; break;
        }
      }
      if (c.Root == null || c.Node == null || c.FaceUrl == null || c.HealthUrl == null || c.Title == null)
        throw new Exception("ayra.ini is incomplete. Run `npm run shortcuts` in the AYRA folder again.");
      return c;
    }
  }

  class Tray
  {
    readonly Config config;
    readonly NotifyIcon icon;
    readonly Bridge bridge;
    readonly Window window;
    readonly HotkeyWindow hotkey;
    readonly SynchronizationContext ui;
    readonly System.Threading.Timer watch;
    readonly EventWaitHandle quitSignal, openSignal;
    readonly object opening = new object();
    int busy;

    public Tray(Config config, bool openWindow)
    {
      this.config = config;
      window = new Window(config);

      var menu = new ContextMenuStrip();
      // Creating the first control installs the WinForms context; capture it so
      // background threads can update the tray safely.
      ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
      bridge = new Bridge(config, Notify);

      menu.Items.Add("Open AYRA", null, delegate { Open(false); });
      menu.Items.Add("Talk to AYRA   " + Pretty(config.Hotkey), null, delegate { Open(true); });
      if (config.Chrome != null) menu.Items.Add("Open Chrome (AYRA)", null, delegate { window.OpenChrome(); });
      menu.Items.Add(new ToolStripSeparator());
      menu.Items.Add("Restart AYRA", null, delegate { ThreadPool.QueueUserWorkItem(delegate { bridge.Restart(); }); });
      menu.Items.Add("Show log", null, delegate { bridge.ShowLog(); });
      menu.Items.Add(new ToolStripSeparator());
      menu.Items.Add("Quit AYRA", null, delegate { Quit(); });

      icon = new NotifyIcon();
      icon.Icon = LoadIcon(config.Icon);
      icon.Text = "AYRA - starting";
      icon.ContextMenuStrip = menu;
      icon.MouseClick += delegate(object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) Open(false); };
      icon.Visible = true;

      hotkey = new HotkeyWindow(config.Hotkey, delegate { Open(true); });
      if (!hotkey.Valid)
        Notify("AYRA_HOTKEY \"" + config.Hotkey + "\" isn't a key combination AYRA knows (try ctrl+alt+a), so the hotkey is off.");
      else if (!hotkey.Registered)
        Notify(Pretty(config.Hotkey) + " is already used by another app, so AYRA's hotkey is off. Set AYRA_HOTKEY and run npm run shortcuts again.");

      // Only once the session is really ending: a cancelled shutdown leaves her running.
      Microsoft.Win32.SystemEvents.SessionEnded += delegate { bridge.Stop(); };
      quitSignal = new EventWaitHandle(false, EventResetMode.AutoReset, Program.QuitEvent);
      ThreadPool.RegisterWaitForSingleObject(quitSignal, delegate { ui.Post(delegate { Quit(); }, null); }, null, -1, true);
      openSignal = new EventWaitHandle(false, EventResetMode.AutoReset, Program.OpenEvent);
      ThreadPool.RegisterWaitForSingleObject(openSignal, delegate { Open(false); }, null, -1, false);
      bridge.EnsureRunning();
      watch = new System.Threading.Timer(delegate { Check(); }, null, 3000, 5000);
      if (openWindow) Open(false);
    }

    // Her window, off the UI thread: opening may wait for the bridge to start.
    void Open(bool talk)
    {
      ThreadPool.QueueUserWorkItem(delegate
      {
        // One at a time: a second click while she is still opening would open a second window.
        if (!Monitor.TryEnter(opening)) return;
        try { window.Show(talk); }
        catch (Exception e) { Notify(e.Message); }
        finally { Monitor.Exit(opening); }
      });
    }

    // Every few seconds: is she answering? Start her if nobody is running her.
    void Check()
    {
      if (Interlocked.Exchange(ref busy, 1) == 1) return;
      try
      {
        var healthy = Bridge.Healthy(config, 2000);
        if (!healthy && !bridge.Running && !bridge.Waiting && !bridge.Stopping && !bridge.GaveUp) bridge.Start();
        var text = healthy ? "AYRA - ready"
          : bridge.GaveUp ? "AYRA - stopped, see the log"
          : bridge.Running ? "AYRA - starting" : "AYRA - not running";
        ui.Post(delegate { if (icon.Visible) icon.Text = text; }, null);
      }
      finally { Interlocked.Exchange(ref busy, 0); }
    }

    void Notify(string message)
    {
      ui.Post(delegate { if (icon.Visible) icon.ShowBalloonTip(6000, "AYRA", message, ToolTipIcon.Info); }, null);
    }

    void Quit()
    {
      watch.Dispose();
      hotkey.Dispose();
      icon.Visible = false;
      bridge.Stop();
      icon.Dispose();
      Application.Exit();
    }

    static Icon LoadIcon(string path)
    {
      try { return new Icon(path, SystemInformation.SmallIconSize); }
      catch { return SystemIcons.Application; }
    }

    static string Pretty(string spec)
    {
      var parts = spec.Split('+');
      for (int i = 0; i < parts.Length; i++)
        parts[i] = parts[i].Length <= 1 ? parts[i].ToUpperInvariant() : char.ToUpperInvariant(parts[i][0]) + parts[i].Substring(1);
      return string.Join("+", parts);
    }
  }

  // The bridge process (scripts/start.mjs, which builds the face if needed and
  // runs bridge/server.mjs), with no window, its output in data/logs/console.log.
  class Bridge
  {
    const long MaxLog = 5 * 1024 * 1024;
    readonly Config config;
    readonly Action<string> notify;
    readonly object gate = new object();
    readonly object logLock = new object();
    readonly string logPath;
    Process proc;
    DateTime started;
    int failures;
    int written;
    StreamWriter log;
    volatile bool quitting;
    public volatile bool Stopping;
    public volatile bool Waiting;
    // Set after repeated crashes or when node can't start: she is left off
    // (and nobody is pestered every few seconds) until Restart AYRA.
    public volatile bool GaveUp;

    public Bridge(Config config, Action<string> notify)
    {
      this.config = config;
      this.notify = notify;
      logPath = Path.Combine(config.Root, "data", "logs", "console.log");
    }

    public bool Running { get { lock (gate) return proc != null; } }

    public static bool Healthy(Config c, int timeoutMs)
    {
      try
      {
        var req = (HttpWebRequest)WebRequest.Create(c.HealthUrl);
        req.Timeout = timeoutMs;
        req.Proxy = null;
        using (var res = (HttpWebResponse)req.GetResponse()) return res.StatusCode == HttpStatusCode.OK;
      }
      catch { return false; }
    }

    // A copy started from a console (npm start) is left alone; she is only
    // started here when nothing is answering.
    public void EnsureRunning()
    {
      ThreadPool.QueueUserWorkItem(delegate { if (!Healthy(config, 1500)) Start(); });
    }

    public void Start()
    {
      lock (gate)
      {
        if (proc != null || Stopping || GaveUp || quitting) return;
        OpenLog();
        // --supervised: start.mjs stops when its input closes (see StopProcess).
        var psi = new ProcessStartInfo(config.Node, "scripts\\start.mjs --supervised");
        psi.WorkingDirectory = config.Root;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardInput = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        var p = new Process();
        p.StartInfo = psi;
        p.EnableRaisingEvents = true;
        p.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { Write(e.Data); };
        p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { Write(e.Data); };
        p.Exited += delegate { Exited(p); };
        try { p.Start(); }
        catch (Exception e)
        {
          Write("--- could not start node (" + config.Node + "): " + e.Message);
          GaveUp = true;
          notify("AYRA could not start (" + e.Message + "). Run npm run shortcuts in the AYRA folder, then choose Restart AYRA.");
          return;
        }
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        proc = p;
        started = DateTime.Now;
        Write("--- AYRA started by AYRA.exe at " + started.ToString("yyyy-MM-dd HH:mm:ss"));
      }
    }

    void Exited(Process p)
    {
      int wait;
      lock (gate)
      {
        if (p != proc) return;
        proc = null;
        Write("--- AYRA stopped (exit " + ExitCode(p) + ") at " + DateTime.Now.ToString("HH:mm:ss"));
        if (Stopping) return;
        // Quick repeated crashes back off and then stop, rather than spin.
        failures = (DateTime.Now - started).TotalSeconds < 60 ? failures + 1 : 1;
        if (failures >= 5)
        {
          GaveUp = true;
          notify("AYRA keeps stopping, so she has been left off. Open the log from the tray menu, then choose Restart AYRA.");
          return;
        }
        wait = Math.Min(60, 1 << failures);
        Waiting = true;
      }
      ThreadPool.QueueUserWorkItem(delegate
      {
        Thread.Sleep(wait * 1000);
        Waiting = false;
        if (!Stopping && !GaveUp && !Healthy(config, 1500)) Start();
      });
    }

    public void Restart()
    {
      if (quitting) return;
      bool external;
      lock (gate) external = proc == null && Healthy(config, 1500);
      if (external)
      {
        notify("AYRA was started from a console window. Close that window, and she will start here by herself.");
        return;
      }
      Stopping = true;
      StopProcess();
      lock (gate) { failures = 0; GaveUp = false; }
      Stopping = false;
      Start(); // does nothing if Quit came in meanwhile
    }

    // For good: Quit, sign-out, npm run shortcuts.
    public void Stop()
    {
      quitting = true;
      Stopping = true;
      StopProcess();
    }

    // Closing start.mjs's input asks it to stop, and it stops only its own
    // server — never a Chrome window she opened, which a whole-tree kill would
    // take down with every tab in it. Forced only if it won't go.
    void StopProcess()
    {
      Process p;
      lock (gate) p = proc;
      if (p == null) return;
      try { p.StandardInput.Close(); } catch { }
      if (!WaitExit(p, 8000))
      {
        // start.mjs and the node it started; nothing further down the tree.
        foreach (var pid in Native.ChildrenOf(p.Id, "node.exe")) KillPid(pid);
        try { p.Kill(); } catch { }
        WaitExit(p, 3000);
      }
      lock (gate) if (proc == p) proc = null;
      Write("--- AYRA stopped by AYRA.exe at " + DateTime.Now.ToString("HH:mm:ss"));
    }

    static bool WaitExit(Process p, int ms)
    {
      try { return p.WaitForExit(ms); } catch { return true; }
    }

    static void KillPid(int pid)
    {
      try { using (var q = Process.GetProcessById(pid)) q.Kill(); } catch { }
    }

    public void ShowLog()
    {
      if (File.Exists(logPath)) Process.Start("notepad.exe", "\"" + logPath + "\"");
    }

    void OpenLog()
    {
      lock (logLock)
      {
        try
        {
          Directory.CreateDirectory(Path.GetDirectoryName(logPath));
          if (log == null || TooBig()) Reopen();
        }
        catch { log = null; }
      }
    }

    bool TooBig()
    {
      try { return File.Exists(logPath) && new FileInfo(logPath).Length > MaxLog; } catch { return false; }
    }

    // A fresh console.log, the previous one kept as console.old.log. Called
    // with logLock held.
    void Reopen()
    {
      if (log != null) { try { log.Dispose(); } catch { } log = null; }
      if (TooBig())
      {
        var old = Path.Combine(Path.GetDirectoryName(logPath), "console.old.log");
        if (File.Exists(old)) File.Delete(old);
        File.Move(logPath, old);
      }
      log = new StreamWriter(new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete), new UTF8Encoding(false));
      log.AutoFlush = true;
    }

    static readonly Regex Ansi = new Regex("\x1b\\[[0-9;]*m");

    void Write(string line)
    {
      if (line == null) return;
      lock (logLock)
      {
        if (log == null) return;
        try
        {
          log.WriteLine(Ansi.Replace(line, ""));
          // One run can last weeks on an always-on laptop, so the size is checked as it goes.
          if (++written % 500 == 0 && log.BaseStream.Length > MaxLog) Reopen();
        }
        catch { }
      }
    }

    static string ExitCode(Process p)
    {
      try { return p.ExitCode.ToString(); } catch { return "?"; }
    }
  }

  // Her window: the face as a "Chrome (AYRA)" app window, titled with her wordmark.
  class Window
  {
    readonly Config config;
    public Window(Config config) { this.config = config; }

    public IntPtr Find()
    {
      IntPtr found = IntPtr.Zero;
      Native.EnumWindows(delegate(IntPtr h, IntPtr l)
      {
        if (!Native.IsWindowVisible(h)) return true;
        var cls = new StringBuilder(64);
        Native.GetClassName(h, cls, cls.Capacity);
        if (cls.ToString() != "Chrome_WidgetWin_1") return true;
        var title = new StringBuilder(256);
        Native.GetWindowText(h, title, title.Capacity);
        if (title.ToString() != config.Title) return true;
        found = h;
        return false;
      }, IntPtr.Zero);
      return found;
    }

    // Brings her window forward, opening it if it isn't open. `talk` then
    // presses Space in it, which starts a turn without the wake word.
    public void Show(bool talk)
    {
      var h = Find();
      if (h != IntPtr.Zero)
      {
        Group(h);
        Focus(h);
        if (talk)
        {
          // The hotkey's own keys are still held; Space must arrive alone.
          Native.WaitForModifiersUp(1500);
          if (Native.GetForegroundWindow() == h) Native.Tap(0x20);
        }
        return;
      }
      if (config.Chrome == null) throw new Exception("Chrome was not found when AYRA was set up. Install it, then run npm run shortcuts again.");
      // The bridge serves her face; when she is still starting, wait for it.
      var ready = false;
      for (int i = 0; i < 120 && !(ready = Bridge.Healthy(config, 1000)); i++) Thread.Sleep(500);
      if (!ready) throw new Exception("AYRA isn't answering yet, so her window wasn't opened. Try again in a minute, or open the log from the tray menu.");
      h = Find();
      if (h != IntPtr.Zero) { Group(h); Focus(h); return; }
      var args = new List<string>(config.ChromeArgs);
      args.Add("--app=" + config.FaceUrl);
      args.Add("--window-size=960,720");
      Launch(config.Chrome, args);
      for (int i = 0; i < 80; i++)
      {
        Thread.Sleep(250);
        h = Find();
        if (h == IntPtr.Zero) continue;
        Group(h);
        Focus(h);
        return;
      }
    }

    public void OpenChrome()
    {
      if (config.Chrome != null) Launch(config.Chrome, config.ChromeArgs);
    }

    static void Launch(string exe, List<string> args)
    {
      var quoted = new List<string>();
      foreach (var a in args) quoted.Add(a.IndexOf(' ') >= 0 ? "\"" + a + "\"" : a);
      // Through the shell: Chrome gets none of this app's handles.
      var psi = new ProcessStartInfo(exe, string.Join(" ", quoted.ToArray()));
      psi.UseShellExecute = true;
      Process.Start(psi);
    }

    static void Focus(IntPtr h)
    {
      if (Native.IsIconic(h)) Native.ShowWindow(h, 9); // SW_RESTORE
      if (Native.SetForegroundWindow(h)) return;
      // Windows hands the focus over only from the app in front, so borrow
      // its input queue for the moment it takes.
      var front = Native.GetForegroundWindow();
      var me = Native.GetCurrentThreadId();
      var them = Native.GetWindowThreadProcessId(front, IntPtr.Zero);
      Native.AttachThreadInput(me, them, true);
      Native.SetForegroundWindow(h);
      Native.BringWindowToTop(h);
      Native.AttachThreadInput(me, them, false);
    }

    // Gives her window AYRA's taskbar identity, so it sits under the pinned
    // AYRA icon, and relaunches through AYRA.exe if pinned itself.
    void Group(IntPtr h)
    {
      IPropertyStore store = null;
      try
      {
        var iid = typeof(IPropertyStore).GUID;
        if (Native.SHGetPropertyStoreForWindow(h, ref iid, out store) != 0 || store == null) return;
        // The relaunch properties must be set before the id.
        Props.Set(store, Props.RelaunchCommand, "\"" + config.Exe + "\"");
        Props.Set(store, Props.RelaunchDisplayName, "AYRA");
        Props.Set(store, Props.RelaunchIcon, config.Icon);
        Props.Set(store, Props.AppId, Program.AppId);
      }
      catch { }
      finally { if (store != null) Marshal.ReleaseComObject(store); }
    }
  }

  class HotkeyWindow : NativeWindow, IDisposable
  {
    const int WM_HOTKEY = 0x0312;
    readonly Action onPress;
    public readonly bool Valid, Registered;

    public HotkeyWindow(string spec, Action onPress)
    {
      this.onPress = onPress;
      var cp = new CreateParams();
      cp.Parent = new IntPtr(-3); // HWND_MESSAGE: never shown
      CreateHandle(cp);
      uint mods, key;
      Valid = Parse(spec, out mods, out key);
      Registered = Valid && Native.RegisterHotKey(Handle, 1, mods | 0x4000, key); // MOD_NOREPEAT
    }

    protected override void WndProc(ref Message m)
    {
      if (m.Msg == WM_HOTKEY) onPress();
      base.WndProc(ref m);
    }

    public void Dispose()
    {
      if (Registered) Native.UnregisterHotKey(Handle, 1);
      DestroyHandle();
    }

    // "ctrl+alt+a", "win+shift+space", "ctrl+f12".
    public static bool Parse(string spec, out uint mods, out uint key)
    {
      mods = 0;
      key = 0;
      foreach (var raw in spec.ToLowerInvariant().Split('+'))
      {
        var part = raw.Trim();
        if (part == "ctrl" || part == "control") mods |= 2;
        else if (part == "alt") mods |= 1;
        else if (part == "shift") mods |= 4;
        else if (part == "win") mods |= 8;
        else if (part == "space") key = 0x20;
        else if (part.Length == 1 && char.IsLetterOrDigit(part[0])) key = char.ToUpperInvariant(part[0]);
        else if (part.Length >= 2 && part[0] == 'f')
        {
          int n;
          if (!int.TryParse(part.Substring(1), out n) || n < 1 || n > 24) return false;
          key = (uint)(0x6F + n);
        }
        else return false;
      }
      return mods != 0 && key != 0;
    }
  }

  static class Shortcuts
  {
    // Desktop and Start-menu shortcuts for AYRA and her Chrome, and AYRA in
    // the Startup folder unless asked not to. Printed so `npm run shortcuts`
    // can show what it made.
    public static int Install(Config config, bool startup)
    {
      var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
      var programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
      var startupDir = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
      var about = "AYRA - your assistant";
      foreach (var dir in new[] { desktop, programs })
      {
        Make(Path.Combine(dir, "AYRA.lnk"), config.Exe, "", config.Root, config.Icon, Program.AppId, about);
        if (config.Chrome != null)
          Make(Path.Combine(dir, "Chrome (AYRA).lnk"), config.Chrome, JoinArgs(config.ChromeArgs), config.Root, config.Chrome, null, "Chrome, signed in as you, that AYRA can drive");
      }
      var login = Path.Combine(startupDir, "AYRA.lnk");
      if (startup) Make(login, config.Exe, "--background", config.Root, config.Icon, Program.AppId, about);
      else if (File.Exists(login)) { File.Delete(login); Console.WriteLine("removed " + login); }
      return 0;
    }

    static string JoinArgs(List<string> args)
    {
      var quoted = new List<string>();
      foreach (var a in args) quoted.Add(a.IndexOf(' ') >= 0 ? "\"" + a + "\"" : a);
      return string.Join(" ", quoted.ToArray());
    }

    static void Make(string path, string target, string args, string workDir, string icon, string appId, string description)
    {
      var link = (IShellLinkW)new CShellLink();
      try
      {
        link.SetPath(target);
        link.SetArguments(args);
        link.SetWorkingDirectory(workDir);
        link.SetIconLocation(icon, 0);
        link.SetDescription(description);
        if (appId != null)
        {
          var store = (IPropertyStore)link;
          Props.Set(store, Props.AppId, appId);
          store.Commit();
        }
        ((IPersistFile)link).Save(path, true);
        Console.WriteLine("made " + path);
      }
      finally { Marshal.ReleaseComObject(link); }
    }
  }

  static class Props
  {
    static readonly Guid AppUserModel = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    public static readonly PropertyKey RelaunchCommand = new PropertyKey(AppUserModel, 2);
    public static readonly PropertyKey RelaunchIcon = new PropertyKey(AppUserModel, 3);
    public static readonly PropertyKey RelaunchDisplayName = new PropertyKey(AppUserModel, 4);
    public static readonly PropertyKey AppId = new PropertyKey(AppUserModel, 5);

    public static void Set(IPropertyStore store, PropertyKey key, string value)
    {
      var v = new PropVariant();
      v.vt = 31; // VT_LPWSTR
      v.p = Marshal.StringToCoTaskMemUni(value);
      try { store.SetValue(ref key, ref v); }
      finally { Marshal.FreeCoTaskMem(v.p); }
    }
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  struct PropertyKey
  {
    public Guid FormatId;
    public uint PropertyId;
    public PropertyKey(Guid formatId, uint propertyId) { FormatId = formatId; PropertyId = propertyId; }
  }

  [StructLayout(LayoutKind.Sequential)]
  struct PropVariant
  {
    public ushort vt;
    public ushort reserved1, reserved2, reserved3;
    public IntPtr p;
    public IntPtr p2;
  }

  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore
  {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetAt(uint index, out PropertyKey key);
    [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
    [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
    [PreserveSig] int Commit();
  }

  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  class CShellLink { }

  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellLinkW
  {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder file, int max, IntPtr data, uint flags);
    void GetIDList(out IntPtr pidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder name, int max);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder dir, int max);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string dir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder args, int max);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
    void GetHotkey(out short hotkey);
    void SetHotkey(short hotkey);
    void GetShowCmd(out int show);
    void SetShowCmd(int show);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int max, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
    void Resolve(IntPtr hwnd, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
  }

  static class Native
  {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc proc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint key);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("shell32.dll")] public static extern int SHGetPropertyStoreForWindow(IntPtr hWnd, ref Guid iid, out IPropertyStore store);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] public static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct ProcessEntry
    {
      public uint dwSize, cntUsage, th32ProcessID;
      public IntPtr th32DefaultHeapID;
      public uint th32ModuleID, cntThreads, th32ParentProcessID;
      public int pcPriClassBase;
      public uint dwFlags;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }

    // The processes named `exe` whose parent is `parent` - one level only.
    public static List<int> ChildrenOf(int parent, string exe)
    {
      var found = new List<int>();
      var snapshot = CreateToolhelp32Snapshot(2, 0); // TH32CS_SNAPPROCESS
      if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1)) return found;
      try
      {
        var e = new ProcessEntry();
        e.dwSize = (uint)Marshal.SizeOf(typeof(ProcessEntry));
        for (var ok = Process32FirstW(snapshot, ref e); ok; ok = Process32NextW(snapshot, ref e))
          if (e.th32ParentProcessID == parent && string.Equals(e.szExeFile, exe, StringComparison.OrdinalIgnoreCase))
            found.Add((int)e.th32ProcessID);
      }
      finally { CloseHandle(snapshot); }
      return found;
    }

    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);

    // With its real scan code: Chrome reports a key without one as no key at
    // all (KeyboardEvent.code ""), and her window listens for code "Space".
    public static void Tap(byte key)
    {
      var scan = (byte)MapVirtualKey(key, 0); // MAPVK_VK_TO_VSC
      keybd_event(key, scan, 0, UIntPtr.Zero);
      keybd_event(key, scan, 2, UIntPtr.Zero); // KEYEVENTF_KEYUP
    }

    // Ctrl, Alt, Shift and the Windows keys all released, or the time is up.
    public static void WaitForModifiersUp(int timeoutMs)
    {
      var keys = new[] { 0x11, 0x12, 0x10, 0x5B, 0x5C };
      var until = DateTime.Now.AddMilliseconds(timeoutMs);
      while (DateTime.Now < until)
      {
        var held = false;
        foreach (var k in keys) if ((GetAsyncKeyState(k) & 0x8000) != 0) held = true;
        if (!held) return;
        Thread.Sleep(20);
      }
    }
  }
}
