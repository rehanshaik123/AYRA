# AYRA's speaker meter - the worker behind bridge/echo.mjs.
#
# How loud the laptop's own speakers are, about sixty times a second, so the
# bridge can tell a burst the microphone heard from the speakers (a video, an
# app, a voice) from the owner speaking - before it pays for a name check.
# This is Windows' own peak meter on the default playback device (the one the
# volume flyout shows), read through Core Audio: no sound is captured or
# stored, only one number - how loud the output is right now.
#
# stdout, and nothing else:
#   start <unix ms>          the wall-clock time of 0 on the clock below; sent
#                            again every 30 s so the two clocks never drift
#   <ms since start> <peak>  peak 0..1, 3 decimals; no lines while there is no
#                            playback device
# It exits when stdin closes: the bridge stopped it, or the bridge is gone.
#
# The loop is C#, not PowerShell: a PowerShell loop at this rate costs real
# CPU, the compiled one next to nothing.
#
# Keep this file ASCII: Windows PowerShell 5.1 reads a script without a BOM in
# the local code page.

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace AyraMeter {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumeratorCom { }

  // Only the methods used, in vtable order; the rest of each interface is never called.
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  }

  [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation {
    [PreserveSig] int GetPeakValue(out float peak);
  }

  public static class Speakers {
    const int RENDER = 0;          // eRender: what plays, not what records
    const int MULTIMEDIA = 1;      // eMultimedia: the device music and videos use
    const int CLSCTX_ALL = 23;
    const int STEP_MS = 10;        // ~16 ms in practice: Windows' default timer tick
    const int CHECK_MS = 3000;     // which device is the default, asked again this often
    const int RETRY_MS = 500;      // after an error (a headset unplugged mid-read)
    const int ANCHOR_MS = 30000;
    const int FLUSH_MS = 50;       // the bridge needs the numbers within a second, not at once
    static volatile bool done;

    static void WatchStdin() {
      try {
        Stream input = Console.OpenStandardInput();
        byte[] buffer = new byte[64];
        while (input.Read(buffer, 0, buffer.Length) > 0) { }
      } catch (Exception) { }
      done = true;
    }

    static void Release(object o) {
      try { if (o != null && Marshal.IsComObject(o)) Marshal.ReleaseComObject(o); } catch (Exception) { }
    }

    static long UnixMs() {
      return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
    }

    public static void Run() {
      Thread watcher = new Thread(WatchStdin);
      watcher.IsBackground = true;
      watcher.Start();

      StreamWriter output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
      CultureInfo inv = CultureInfo.InvariantCulture;
      Stopwatch clock = Stopwatch.StartNew();
      IMMDeviceEnumerator devices = null;
      IAudioMeterInformation meter = null;
      string meterOf = null;
      long nextCheck = 0, nextAnchor = 0, lastFlush = 0;

      try {
        while (!done) {
          long ms = clock.ElapsedMilliseconds;
          if (ms >= nextAnchor) {
            nextAnchor = ms + ANCHOR_MS;
            output.Write("start " + (UnixMs() - clock.ElapsedMilliseconds).ToString(inv) + "\n");
          }
          if (ms >= nextCheck) {
            nextCheck = ms + CHECK_MS;
            IMMDevice device = null;
            try {
              if (devices == null) devices = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
              string id = null;
              if (devices.GetDefaultAudioEndpoint(RENDER, MULTIMEDIA, out device) == 0 && device != null) {
                device.GetId(out id);
                if (meter == null || id != meterOf) {
                  Release(meter);
                  meter = null;
                  meterOf = null;
                  Guid iid = typeof(IAudioMeterInformation).GUID;
                  object found;
                  if (device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out found) == 0 && found != null) {
                    meter = (IAudioMeterInformation)found;
                    meterOf = id;
                  }
                }
              } else {
                // No playback device at all: say nothing until there is one.
                Release(meter);
                meter = null;
                meterOf = null;
              }
            } catch (Exception) {
              Release(meter);
              Release(devices);
              meter = null;
              meterOf = null;
              devices = null;
              nextCheck = ms + RETRY_MS;
            } finally {
              Release(device);
            }
          }
          if (meter != null) {
            float peak = 0f;
            int hr;
            try { hr = meter.GetPeakValue(out peak); } catch (Exception) { hr = -1; }
            if (hr == 0) {
              if (peak < 0f) peak = 0f;
              if (peak > 1f) peak = 1f;
              output.Write(ms.ToString(inv) + " " + peak.ToString("0.000", inv) + "\n");
            } else {
              // The device went away mid-read: find the new default soon.
              Release(meter);
              meter = null;
              meterOf = null;
              nextCheck = ms + RETRY_MS;
            }
          }
          if (ms - lastFlush >= FLUSH_MS) {
            lastFlush = ms;
            output.Flush();
          }
          Thread.Sleep(STEP_MS);
        }
      } catch (IOException) {
        // stdout is gone: so is the bridge.
      } finally {
        Release(meter);
        Release(devices);
      }
    }
  }
}
'@
[AyraMeter.Speakers]::Run()
