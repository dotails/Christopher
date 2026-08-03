using System;
using System.Diagnostics;
using System.IO;

namespace SscSwitcher
{
    /// <summary>
    /// The core behaviour when a .ssc file is opened: copy it over the active
    /// .ssc in the configured target folder (optionally backing up the previous
    /// one), then launch srcsig.exe from that same folder.
    /// </summary>
    internal static class SscHandler
    {
        /// <param name="openedFilePath">The .ssc file the user double-clicked.</param>
        /// <param name="cfg">Current settings.</param>
        /// <param name="log">Optional progress sink (used by the "Test swap" UI).</param>
        public static void HandleOpen(string openedFilePath, AppConfig cfg, Action<string> log = null)
        {
            if (log == null) log = delegate { };

            if (string.IsNullOrWhiteSpace(openedFilePath))
                throw new ArgumentException("No .ssc file was provided.");

            openedFilePath = Path.GetFullPath(openedFilePath);

            if (!File.Exists(openedFilePath))
                throw new FileNotFoundException("The opened file does not exist.", openedFilePath);

            if (!openedFilePath.EndsWith(Defaults.Extension, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException(
                    "The opened file is not a " + Defaults.Extension + " file:\n" + openedFilePath);

            string target = cfg.ResolvedTargetFolder;
            if (string.IsNullOrWhiteSpace(target))
                throw new InvalidOperationException(
                    "No target folder is configured. Open " + Defaults.ProductName +
                    " directly to set the folder that contains " + cfg.SrcSigExeName + ".");

            if (!Directory.Exists(target))
                throw new DirectoryNotFoundException("Configured target folder does not exist:\n" + target);

            // Which file in the target folder gets overwritten.
            string destName = DetermineDestinationName(openedFilePath, target, cfg);
            string destPath = Path.Combine(target, destName);

            if (PathsEqual(destPath, openedFilePath))
            {
                log("Opened file is already the active file; no copy needed.");
            }
            else
            {
                if (cfg.BackupOnSwap && File.Exists(destPath))
                    BackupFile(destPath, log);

                File.Copy(openedFilePath, destPath, true);
                log("Swapped \"" + destName + "\" with \"" + Path.GetFileName(openedFilePath) + "\".");
            }

            if (cfg.LaunchAfterSwap)
                LaunchSrcSig(target, cfg, log);
        }

        private static string DetermineDestinationName(string openedFilePath, string target, AppConfig cfg)
        {
            // Prefer auto-detect: if the folder holds exactly one .ssc, that's the
            // active file we replace.
            if (cfg.AutoDetectActiveFile)
            {
                string[] existing = Directory.GetFiles(target, "*" + Defaults.Extension, SearchOption.TopDirectoryOnly);
                if (existing.Length == 1)
                    return Path.GetFileName(existing[0]);
                // 0 or many -> fall through to the configured/opened name.
            }

            if (!string.IsNullOrWhiteSpace(cfg.ActiveFileName))
                return cfg.ActiveFileName;

            // Last resort: keep the opened file's own name.
            return Path.GetFileName(openedFilePath);
        }

        private static void BackupFile(string destPath, Action<string> log)
        {
            try
            {
                string dir = Path.GetDirectoryName(destPath);
                string backupDir = Path.Combine(dir, "_ssc_backups");
                Directory.CreateDirectory(backupDir);

                string stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                string backupPath = Path.Combine(
                    backupDir,
                    Path.GetFileNameWithoutExtension(destPath) + "_" + stamp + Path.GetExtension(destPath));

                File.Copy(destPath, backupPath, true);
                log("Backed up previous file to \"" + backupPath + "\".");
            }
            catch (Exception ex)
            {
                // A failed backup should not block the swap; just note it.
                log("Warning: backup failed (" + ex.Message + ").");
            }
        }

        private static void LaunchSrcSig(string target, AppConfig cfg, Action<string> log)
        {
            string exeName = string.IsNullOrWhiteSpace(cfg.SrcSigExeName)
                ? Defaults.SrcSigExeName
                : cfg.SrcSigExeName;

            string exePath = Path.IsPathRooted(exeName) ? exeName : Path.Combine(target, exeName);

            if (!File.Exists(exePath))
                throw new FileNotFoundException(
                    "Could not find \"" + exeName + "\" in the target folder:\n" + target, exePath);

            var psi = new ProcessStartInfo
            {
                FileName = exePath,
                WorkingDirectory = target,
                UseShellExecute = true
            };
            Process.Start(psi);
            log("Launched \"" + exeName + "\".");
        }

        private static bool PathsEqual(string a, string b)
        {
            return string.Equals(
                Path.GetFullPath(a).TrimEnd('\\'),
                Path.GetFullPath(b).TrimEnd('\\'),
                StringComparison.OrdinalIgnoreCase);
        }
    }
}
