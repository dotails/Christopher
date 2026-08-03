using System;
using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace SscSwitcher
{
    /// <summary>
    /// The window shown when the app is launched directly. Lets the user pick
    /// the target folder + settings and manage the .ssc association. Built in
    /// code (no .resx) so it compiles with a plain csc.exe.
    /// </summary>
    public class ConfigForm : Form
    {
        private readonly AppConfig _cfg;

        private TextBox _txtTarget;
        private TextBox _txtActive;
        private TextBox _txtSrcSig;
        private CheckBox _chkAutoDetect;
        private CheckBox _chkBackup;
        private CheckBox _chkLaunch;
        private Label _lblAssocStatus;

        public ConfigForm()
        {
            _cfg = AppConfig.Load();
            BuildUi();
            LoadFromConfig();
            RefreshAssocStatus();
        }

        private void BuildUi()
        {
            Text = Defaults.ProductName + " — Configuration";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(560, 452);
            Font = new Font("Segoe UI", 9f);

            int x = 16;
            int y = 16;
            int w = ClientSize.Width - 32;

            AddLabel("Target folder (contains " + Defaults.SrcSigExeName + " and the active .ssc):", x, y, w);
            y += 22;
            _txtTarget = new TextBox { Left = x, Top = y, Width = w - 90 };
            var btnBrowse = new Button { Text = "Browse…", Left = x + w - 84, Top = y - 1, Width = 84 };
            btnBrowse.Click += delegate { BrowseFolder(); };
            Controls.Add(_txtTarget);
            Controls.Add(btnBrowse);
            y += 34;

            AddLabel("Active file name (the .ssc that gets overwritten):", x, y, w);
            y += 22;
            _txtActive = new TextBox { Left = x, Top = y, Width = w };
            Controls.Add(_txtActive);
            y += 30;

            _chkAutoDetect = new CheckBox
            {
                Text = "Auto-detect the active .ssc when the folder holds exactly one",
                Left = x,
                Top = y,
                Width = w
            };
            Controls.Add(_chkAutoDetect);
            y += 32;

            AddLabel("Signing app to launch after the swap:", x, y, w);
            y += 22;
            _txtSrcSig = new TextBox { Left = x, Top = y, Width = w };
            Controls.Add(_txtSrcSig);
            y += 32;

            _chkBackup = new CheckBox
            {
                Text = "Back up the overwritten file before swapping",
                Left = x,
                Top = y,
                Width = w
            };
            Controls.Add(_chkBackup);
            y += 26;

            _chkLaunch = new CheckBox
            {
                Text = "Launch the signing app after swapping",
                Left = x,
                Top = y,
                Width = w
            };
            Controls.Add(_chkLaunch);
            y += 40;

            var grp = new GroupBox
            {
                Text = "File association (.ssc)",
                Left = x,
                Top = y,
                Width = w,
                Height = 98
            };
            _lblAssocStatus = new Label { Left = 12, Top = 22, Width = grp.Width - 24, Height = 20 };
            var btnRegister = new Button
            {
                Text = "Make " + Defaults.ProductName + " the .ssc handler",
                Left = 12,
                Top = 48,
                Width = 250
            };
            btnRegister.Click += delegate
            {
                try
                {
                    FileAssociation.Register();
                    FileAssociation.EnableStartup();
                    RefreshAssocStatus();
                }
                catch (Exception ex) { Err(ex); }
            };
            var btnUnregister = new Button
            {
                Text = "Remove association",
                Left = 274,
                Top = 48,
                Width = 160
            };
            btnUnregister.Click += delegate
            {
                try
                {
                    FileAssociation.Unregister();
                    RefreshAssocStatus();
                }
                catch (Exception ex) { Err(ex); }
            };
            grp.Controls.Add(_lblAssocStatus);
            grp.Controls.Add(btnRegister);
            grp.Controls.Add(btnUnregister);
            Controls.Add(grp);
            y += grp.Height + 14;

            var btnTest = new Button { Text = "Test swap…", Left = x, Top = y, Width = 110 };
            btnTest.Click += delegate { TestSwap(); };
            var btnSave = new Button { Text = "Save", Left = x + w - 180, Top = y, Width = 84 };
            btnSave.Click += delegate { SaveWithMessage(); };
            var btnClose = new Button { Text = "Close", Left = x + w - 88, Top = y, Width = 84 };
            btnClose.Click += delegate { Close(); };
            Controls.Add(btnTest);
            Controls.Add(btnSave);
            Controls.Add(btnClose);

            AcceptButton = btnSave;
            CancelButton = btnClose;
        }

        private void AddLabel(string text, int x, int y, int w)
        {
            Controls.Add(new Label { Text = text, Left = x, Top = y, Width = w, Height = 18 });
        }

        private void LoadFromConfig()
        {
            _txtTarget.Text = _cfg.TargetFolder ?? string.Empty;
            _txtActive.Text = _cfg.ActiveFileName ?? string.Empty;
            _txtSrcSig.Text = _cfg.SrcSigExeName ?? string.Empty;
            _chkAutoDetect.Checked = _cfg.AutoDetectActiveFile;
            _chkBackup.Checked = _cfg.BackupOnSwap;
            _chkLaunch.Checked = _cfg.LaunchAfterSwap;
        }

        private void Persist()
        {
            _cfg.TargetFolder = _txtTarget.Text.Trim();
            _cfg.ActiveFileName = _txtActive.Text.Trim();
            _cfg.SrcSigExeName = _txtSrcSig.Text.Trim();
            _cfg.AutoDetectActiveFile = _chkAutoDetect.Checked;
            _cfg.BackupOnSwap = _chkBackup.Checked;
            _cfg.LaunchAfterSwap = _chkLaunch.Checked;
            _cfg.Save();
        }

        private void SaveWithMessage()
        {
            try
            {
                Persist();
                MessageBox.Show(this, "Settings saved to:\n" + AppConfig.ConfigPath,
                    Defaults.ProductName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex) { Err(ex); }
        }

        private void BrowseFolder()
        {
            using (var dlg = new FolderBrowserDialog { Description = "Select the folder that contains " + Defaults.SrcSigExeName })
            {
                if (!string.IsNullOrWhiteSpace(_txtTarget.Text))
                {
                    string expanded = Defaults.Expand(_txtTarget.Text);
                    if (System.IO.Directory.Exists(expanded))
                        dlg.SelectedPath = expanded;
                }
                if (dlg.ShowDialog(this) == DialogResult.OK)
                    _txtTarget.Text = dlg.SelectedPath;
            }
        }

        private void TestSwap()
        {
            using (var ofd = new OpenFileDialog
            {
                Title = "Pick a .ssc file to swap in",
                Filter = "SSC files (*.ssc)|*.ssc|All files (*.*)|*.*"
            })
            {
                if (ofd.ShowDialog(this) != DialogResult.OK) return;

                var log = new StringBuilder();
                try
                {
                    Persist();
                    SscHandler.HandleOpen(ofd.FileName, _cfg, m => log.AppendLine(m));
                    string text = log.ToString().Trim();
                    MessageBox.Show(this, text.Length == 0 ? "Done." : text,
                        Defaults.ProductName + " — Test", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    string prefix = log.Length > 0 ? log.ToString() + Environment.NewLine : string.Empty;
                    MessageBox.Show(this, prefix + "Error: " + ex.Message,
                        Defaults.ProductName + " — Test", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private void RefreshAssocStatus()
        {
            bool reg = FileAssociation.IsRegistered();
            bool startup = FileAssociation.IsStartupEnabled();

            _lblAssocStatus.Text =
                (reg ? "✓ " + Defaults.ProductName + " is the current .ssc handler."
                     : "✗ " + Defaults.ProductName + " is NOT the .ssc handler.")
                + (startup ? "   Startup check: ON" : "   Startup check: OFF");

            _lblAssocStatus.ForeColor = reg ? Color.Green : Color.Firebrick;
        }

        private void Err(Exception ex)
        {
            MessageBox.Show(this, ex.Message, Defaults.ProductName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
