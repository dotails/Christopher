using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace SscSwitcher
{
    /// <summary>
    /// Registers/unregisters the .ssc file association and the login startup
    /// check. Everything is written under HKEY_CURRENT_USER, so this works
    /// without administrator rights or a UAC prompt.
    /// </summary>
    internal static class FileAssociation
    {
        [DllImport("shell32.dll")]
        private static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);

        private const int SHCNE_ASSOCCHANGED = 0x08000000;
        private const int SHCNF_IDLIST = 0x0000;

        private const string Classes = @"Software\Classes";
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

        /// <summary>Full path of the currently running executable.</summary>
        public static string ExePath
        {
            get
            {
                using (var p = Process.GetCurrentProcess())
                {
                    return p.MainModule.FileName;
                }
            }
        }

        /// <summary>
        /// Make this executable the handler for .ssc files (per user).
        /// </summary>
        public static void Register()
        {
            string exe = ExePath;

            // 1) Point the extension at our ProgID and advertise it in OpenWith.
            using (var ext = Registry.CurrentUser.CreateSubKey(Classes + "\\" + Defaults.Extension))
            {
                ext.SetValue("", Defaults.ProgId);
                ext.SetValue("Content Type", "text/plain");
                ext.SetValue("PerceivedType", "text");
                using (var owp = ext.CreateSubKey("OpenWithProgids"))
                {
                    owp.SetValue(Defaults.ProgId, new byte[0], RegistryValueKind.None);
                }
            }

            // 2) Describe the ProgID: friendly name, icon, and open command.
            using (var prog = Registry.CurrentUser.CreateSubKey(Classes + "\\" + Defaults.ProgId))
            {
                prog.SetValue("", Defaults.FriendlyTypeName);
                using (var icon = prog.CreateSubKey("DefaultIcon"))
                    icon.SetValue("", "\"" + exe + "\",0");
                using (var cmd = prog.CreateSubKey(@"shell\open\command"))
                    cmd.SetValue("", "\"" + exe + "\" \"%1\"");
            }

            // 3) Register the application itself (so it appears under "Open with").
            string appName = Path.GetFileName(exe);
            using (var appCmd = Registry.CurrentUser.CreateSubKey(
                Classes + @"\Applications\" + appName + @"\shell\open\command"))
            {
                appCmd.SetValue("", "\"" + exe + "\" \"%1\"");
            }

            NotifyShell();
        }

        /// <summary>True if this exe is the registered open command for .ssc.</summary>
        public static bool IsRegistered()
        {
            try
            {
                using (var cmd = Registry.CurrentUser.OpenSubKey(
                    Classes + "\\" + Defaults.ProgId + @"\shell\open\command"))
                {
                    if (cmd == null) return false;
                    var val = cmd.GetValue("") as string;
                    if (string.IsNullOrEmpty(val)) return false;
                    // Match on our exe path so a stale/other registration reads as "not us".
                    return val.IndexOf(ExePath, StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>Remove the association and the startup check.</summary>
        public static void Unregister()
        {
            try { Registry.CurrentUser.DeleteSubKeyTree(Classes + "\\" + Defaults.ProgId, false); }
            catch { }

            try
            {
                using (var ext = Registry.CurrentUser.OpenSubKey(Classes + "\\" + Defaults.Extension, true))
                {
                    if (ext != null)
                    {
                        if ((ext.GetValue("") as string) == Defaults.ProgId)
                            ext.SetValue("", "");
                        using (var owp = ext.OpenSubKey("OpenWithProgids", true))
                        {
                            if (owp != null) owp.DeleteValue(Defaults.ProgId, false);
                        }
                    }
                }
            }
            catch { }

            try
            {
                string appName = Path.GetFileName(ExePath);
                Registry.CurrentUser.DeleteSubKeyTree(Classes + @"\Applications\" + appName, false);
            }
            catch { }

            RemoveStartup();
            NotifyShell();
        }

        /// <summary>Run a silent association self-check at every login.</summary>
        public static void EnableStartup()
        {
            using (var run = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                run.SetValue(Defaults.StartupRunValueName, "\"" + ExePath + "\" --startup-check");
            }
        }

        public static void RemoveStartup()
        {
            try
            {
                using (var run = Registry.CurrentUser.OpenSubKey(RunKey, true))
                {
                    if (run != null) run.DeleteValue(Defaults.StartupRunValueName, false);
                }
            }
            catch { }
        }

        public static bool IsStartupEnabled()
        {
            try
            {
                using (var run = Registry.CurrentUser.OpenSubKey(RunKey))
                {
                    return run != null && run.GetValue(Defaults.StartupRunValueName) != null;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void NotifyShell()
        {
            SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, IntPtr.Zero, IntPtr.Zero);
        }
    }
}
