using System;
using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace SscSwitcher
{
    /// <summary>
    /// The window shown when the app is launched directly. Lets the user pick
    /// the target folder + settings and manage the .ssc association. Built in
    /// code (no .resx) so it compiles with a plain csc.exe. Laid out with
    /// TableLayoutPanel/anchoring so the window is resizable, labels wrap
    /// instead of clipping, and everything scales correctly at any Windows
    /// display (DPI) setting.
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
            AutoScaleMode = AutoScaleMode.Dpi;
            AutoScaleDimensions = new SizeF(96F, 96F);

            _cfg = AppConfig.Load();
            BuildUi();
            LoadFromConfig();
            RefreshAssocStatus();
        }

        private void BuildUi()
        {
            Text = Defaults.ProductName + " — Configuration";
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = true;
            MinimizeBox = true;
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 9f);
            Size = new Size(640, 620);
            MinimumSize = new Size(480, 420);

            // Root: a scrollable field area on top, an action bar pinned to the bottom.
            var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            Controls.Add(root);

            var scroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
            root.Controls.Add(scroll, 0, 0);

            var fields = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 1,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(16)
            };
            fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            scroll.Controls.Add(fields);

            AddSectionLabel(fields, "Target folder (contains " + Defaults.SrcSigExeName + " and the active .ssc):");
            _txtTarget = new TextBox { Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            var btnBrowse = new Button { Text = "Browse…", AutoSize = true, Margin = new Padding(6, 0, 0, 0) };
            btnBrowse.Click += delegate { BrowseFolder(); };
            AddRow(fields, MakeSideBySideRow(_txtTarget, btnBrowse));
            AddSpacer(fields, 10);

            AddSectionLabel(fields, "Active file name (the .ssc that gets overwritten):");
            _txtActive = new TextBox { Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            AddRow(fields, _txtActive);
            AddSpacer(fields, 12);

            _chkAutoDetect = new CheckBox
            {
                Text = "Auto-detect the active .ssc when the folder holds exactly one",
                AutoSize = true,
                Dock = DockStyle.Top
            };
            AddRow(fields, _chkAutoDetect);
            AddSpacer(fields, 12);

            AddSectionLabel(fields, "Signing app to launch after the swap:");
            _txtSrcSig = new TextBox { Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            AddRow(fields, _txtSrcSig);
            AddSpacer(fields, 12);

            _chkBackup = new CheckBox
            {
                Text = "Back up the overwritten file before swapping",
                AutoSize = true,
                Dock = DockStyle.Top
            };
            AddRow(fields, _chkBackup);
            AddSpacer(fields, 4);

            _chkLaunch = new CheckBox
            {
                Text = "Launch the signing app after swapping",
                AutoSize = true,
                Dock = DockStyle.Top
            };
            AddRow(fields, _chkLaunch);
            AddSpacer(fields, 16);

            AddRow(fields, BuildAssociationGroup());

            var buttonBar = BuildButtonBar();
            root.Controls.Add(buttonBar, 0, 1);
        }

        /// <summary>A wrapping description label, full width, own row.</summary>
        private static void AddSectionLabel(TableLayoutPanel fields, string text)
        {
            var lbl = new Label
            {
                Text = text,
                AutoSize = true,
                Dock = DockStyle.Top,
                Margin = new Padding(0, 0, 0, 4)
            };
            AddRow(fields, lbl);
        }

        private static void AddSpacer(TableLayoutPanel fields, int height)
        {
            AddRow(fields, new Panel { Height = height, Dock = DockStyle.Top, Margin = Padding.Empty });
        }

        private static void AddRow(TableLayoutPanel fields, Control control)
        {
            int row = fields.RowCount;
            fields.RowCount = row + 1;
            fields.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            fields.Controls.Add(control, 0, row);
        }

        /// <summary>A stretchy control (e.g. a textbox) with a fixed-width control beside it.</summary>
        private static Control MakeSideBySideRow(Control stretchy, Control fixedWidth)
        {
            var row = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 2,
                RowCount = 1,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = Padding.Empty
            };
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            row.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            stretchy.Dock = DockStyle.Fill;
            row.Controls.Add(stretchy, 0, 0);
            row.Controls.Add(fixedWidth, 1, 0);
            return row;
        }

        private Control BuildAssociationGroup()
        {
            // Note: GroupBox has no public AutoSizeMode property (only AutoSize),
            // and its DisplayRectangle override ignores Padding, so spacing below
            // is applied on the inner panel instead.
            var grp = new GroupBox
            {
                Text = "File association (.ssc)",
                Dock = DockStyle.Top,
                AutoSize = true
            };

            var inner = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 1,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(6, 4, 6, 10)
            };
            inner.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

            _lblAssocStatus = new Label
            {
                AutoSize = true,
                Dock = DockStyle.Top,
                Margin = new Padding(0, 4, 0, 8)
            };
            inner.RowCount = 1;
            inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            inner.Controls.Add(_lblAssocStatus, 0, 0);

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = true,
                Margin = Padding.Empty
            };
            var btnRegister = new Button
            {
                Text = "Make " + Defaults.ProductName + " the .ssc handler",
                AutoSize = true,
                Margin = new Padding(0, 0, 8, 4)
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
                AutoSize = true,
                Margin = new Padding(0, 0, 0, 4)
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
            buttons.Controls.Add(btnRegister);
            buttons.Controls.Add(btnUnregister);

            inner.RowCount = 2;
            inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            inner.Controls.Add(buttons, 0, 1);

            grp.Controls.Add(inner);
            return grp;
        }

        private Control BuildButtonBar()
        {
            var bar = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(16, 10, 16, 14)
            };
            bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            bar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            bar.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            var btnTest = new Button { Text = "Test swap…", AutoSize = true, Anchor = AnchorStyles.Left };
            btnTest.Click += delegate { TestSwap(); };
            bar.Controls.Add(btnTest, 0, 0);

            var right = new FlowLayoutPanel
            {
                Dock = DockStyle.Right,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                FlowDirection = FlowDirection.RightToLeft,
                Margin = Padding.Empty
            };
            var btnClose = new Button { Text = "Close", AutoSize = true, Margin = new Padding(8, 0, 0, 0) };
            btnClose.Click += delegate { Close(); };
            var btnSave = new Button { Text = "Save", AutoSize = true, Margin = Padding.Empty };
            btnSave.Click += delegate { SaveWithMessage(); };
            // RightToLeft flow: first added ends up rightmost, so add Close then Save
            // to read left-to-right as "Save  Close".
            right.Controls.Add(btnClose);
            right.Controls.Add(btnSave);
            bar.Controls.Add(right, 1, 0);

            AcceptButton = btnSave;
            CancelButton = btnClose;

            return bar;
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
