using System;
using System.Linq;
using System.Windows.Forms;

namespace SscSwitcher
{
    internal static class Program
    {
        /// <summary>
        /// Entry point. Behaviour is chosen by the command line:
        ///   (no args)            -> open the configuration window
        ///   --register/--install -> become the .ssc handler + enable startup check
        ///   --unregister/...     -> remove the association + startup check
        ///   --startup-check      -> silently re-assert the association (login task)
        ///   &lt;path.ssc&gt;      -> swap the file in and launch srcsig.exe
        /// Add --silent to suppress the confirmation dialog on register/unregister.
        /// </summary>
        [STAThread]
        private static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (args.Length == 0)
            {
                Application.Run(new ConfigForm());
                return 0;
            }

            string first = args[0];
            bool silent = args.Any(a => string.Equals(a, "--silent", StringComparison.OrdinalIgnoreCase));

            try
            {
                switch (first.ToLowerInvariant())
                {
                    case "--register":
                    case "--install":
                        FileAssociation.Register();
                        FileAssociation.EnableStartup();
                        if (!silent)
                            Info(".ssc files are now handled by " + Defaults.ProductName +
                                 ".\nA login startup check has been enabled.");
                        return 0;

                    case "--unregister":
                    case "--uninstall":
                        FileAssociation.Unregister();
                        if (!silent)
                            Info("The .ssc association and startup check have been removed.");
                        return 0;

                    case "--startup-check":
                        StartupCheck();
                        return 0;

                    case "--help":
                    case "-h":
                    case "/?":
                        Info(HelpText());
                        return 0;

                    default:
                        // Anything else is treated as a file to open.
                        return HandleFile(first);
                }
            }
            catch (Exception ex)
            {
                // Respect --silent even on failure: an unattended/installer-driven
                // run must never block on a dialog nobody is there to dismiss.
                if (!silent) Error(ex.Message);
                return 1;
            }
        }

        /// <summary>
        /// Silently ensure we are still the .ssc handler. Runs at login; never
        /// shows UI, and never crashes the login sequence.
        /// </summary>
        private static void StartupCheck()
        {
            try
            {
                if (!FileAssociation.IsRegistered())
                    FileAssociation.Register();
                if (!FileAssociation.IsStartupEnabled())
                    FileAssociation.EnableStartup();
            }
            catch
            {
                // Best-effort only.
            }
        }

        private static int HandleFile(string path)
        {
            var cfg = AppConfig.Load();

            if (string.IsNullOrWhiteSpace(cfg.ResolvedTargetFolder))
            {
                Info("No target folder is configured yet.\n\n" +
                     "Please choose the folder that contains " + cfg.SrcSigExeName +
                     " and the active .ssc file.");
                Application.Run(new ConfigForm());
                return 2;
            }

            try
            {
                SscHandler.HandleOpen(path, cfg);
                return 0;
            }
            catch (Exception ex)
            {
                Error(ex.Message);
                return 1;
            }
        }

        private static string HelpText()
        {
            return Defaults.ProductName + " — .ssc file handler\n\n" +
                   "Usage:\n" +
                   "  SscSwitcher.exe                 Open the configuration window\n" +
                   "  SscSwitcher.exe <file>.ssc      Swap the file in and launch " + Defaults.SrcSigExeName + "\n" +
                   "  SscSwitcher.exe --register      Become the .ssc handler + enable startup check\n" +
                   "  SscSwitcher.exe --unregister    Remove the association + startup check\n" +
                   "  SscSwitcher.exe --startup-check Silently re-assert the association\n" +
                   "  (add --silent to suppress dialogs on register/unregister)";
        }

        private static void Info(string msg)
        {
            MessageBox.Show(msg, Defaults.ProductName, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private static void Error(string msg)
        {
            MessageBox.Show(msg, Defaults.ProductName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
