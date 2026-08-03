using System;

namespace SscSwitcher
{
    /// <summary>
    /// Central place for install-time / deployment defaults.
    ///
    /// >>> FILL IN THE PLACEHOLDERS MARKED "TODO" BELOW <<<
    /// These are the only values you should normally need to change before shipping.
    /// </summary>
    internal static class Defaults
    {
        // ---------------------------------------------------------------------
        //  DEFAULT INSTALL FOLDER  (the "spot" you asked me to leave)
        //  Where SscSwitcher.exe is copied by scripts\install.ps1.
        //  Environment variables are expanded (e.g. "%LOCALAPPDATA%\SscSwitcher").
        //  TODO: replace with the real folder you will provide later.
        // ---------------------------------------------------------------------
        public const string InstallFolder = @"%LOCALAPPDATA%\SscSwitcher";

        // ---------------------------------------------------------------------
        //  DEFAULT TARGET FOLDER  (the "specific folder")
        //  This is the folder that holds srcsig.exe and the active .ssc file.
        //  The user can (and normally will) set this in the config GUI.
        //  Leave it as "" to force the user to pick it on first run, or preset
        //  a path here if you want a default.
        // ---------------------------------------------------------------------
        public const string TargetFolder = @"";

        // Name of the .ssc file inside TargetFolder that gets overwritten when a
        // .ssc file is opened. Used when auto-detect is off, or when the folder
        // does not yet contain exactly one .ssc file.
        public const string ActiveFileName = "active.ssc";

        // The signing app launched (from TargetFolder) right after the swap.
        public const string SrcSigExeName = "srcsig.exe";

        // ---------------------------------------------------------------------
        //  The rest rarely needs changing.
        // ---------------------------------------------------------------------

        // File extension handled by this app (leading dot included).
        public const string Extension = ".ssc";

        // ProgID used in the Windows registry for the .ssc association.
        public const string ProgId = "SscSwitcher.ssc";

        // Friendly type name shown in Explorer for .ssc files.
        public const string FriendlyTypeName = "SSC Source Signature File";

        // Value name used under the HKCU Run key for the startup self-check.
        public const string StartupRunValueName = "SscSwitcherStartupCheck";

        // Product name (used for the %APPDATA% config folder, dialogs, etc.).
        public const string ProductName = "SscSwitcher";

        /// <summary>Expands %VARS% in a path; returns "" for null/empty.</summary>
        public static string Expand(string path)
        {
            return string.IsNullOrEmpty(path)
                ? string.Empty
                : Environment.ExpandEnvironmentVariables(path);
        }
    }
}
