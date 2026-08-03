using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace SscSwitcher
{
    /// <summary>
    /// User-editable settings, stored as JSON under %APPDATA%\SscSwitcher\config.json.
    /// </summary>
    [DataContract]
    public class AppConfig
    {
        /// <summary>The "specific folder" that holds srcsig.exe and the active .ssc.</summary>
        [DataMember(Name = "targetFolder")]
        public string TargetFolder { get; set; }

        /// <summary>Name of the .ssc inside TargetFolder that gets overwritten.</summary>
        [DataMember(Name = "activeFileName")]
        public string ActiveFileName { get; set; }

        /// <summary>Executable launched (from TargetFolder) after the swap.</summary>
        [DataMember(Name = "srcSigExeName")]
        public string SrcSigExeName { get; set; }

        /// <summary>Back up the overwritten file before swapping.</summary>
        [DataMember(Name = "backupOnSwap")]
        public bool BackupOnSwap { get; set; }

        /// <summary>Launch the signing app after swapping.</summary>
        [DataMember(Name = "launchAfterSwap")]
        public bool LaunchAfterSwap { get; set; }

        /// <summary>
        /// When the target folder contains exactly one .ssc, overwrite that one
        /// (instead of the fixed <see cref="ActiveFileName"/>).
        /// </summary>
        [DataMember(Name = "autoDetectActiveFile")]
        public bool AutoDetectActiveFile { get; set; }

        public AppConfig()
        {
            ApplyDefaults();
        }

        // DataContractJsonSerializer creates the object WITHOUT calling the
        // constructor, so seed defaults here too. This runs before members are
        // populated, so any values present in the JSON still win.
        [OnDeserializing]
        private void OnDeserializing(StreamingContext ctx)
        {
            ApplyDefaults();
        }

        private void ApplyDefaults()
        {
            TargetFolder = Defaults.TargetFolder;
            ActiveFileName = Defaults.ActiveFileName;
            SrcSigExeName = Defaults.SrcSigExeName;
            BackupOnSwap = true;
            LaunchAfterSwap = true;
            AutoDetectActiveFile = true;
        }

        public static string ConfigDirectory
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    Defaults.ProductName);
            }
        }

        public static string ConfigPath
        {
            get { return Path.Combine(ConfigDirectory, "config.json"); }
        }

        /// <summary>TargetFolder with %VARS% expanded.</summary>
        public string ResolvedTargetFolder
        {
            get { return Defaults.Expand(TargetFolder); }
        }

        public static AppConfig Load()
        {
            try
            {
                if (File.Exists(ConfigPath))
                {
                    using (var fs = File.OpenRead(ConfigPath))
                    {
                        var ser = new DataContractJsonSerializer(typeof(AppConfig));
                        var cfg = ser.ReadObject(fs) as AppConfig;
                        if (cfg != null)
                        {
                            cfg.Normalize();
                            return cfg;
                        }
                    }
                }
            }
            catch
            {
                // Corrupt/unreadable config -> fall back to defaults rather than crash.
            }
            return new AppConfig();
        }

        public void Save()
        {
            Normalize();
            Directory.CreateDirectory(ConfigDirectory);
            var ser = new DataContractJsonSerializer(typeof(AppConfig));
            using (var ms = new MemoryStream())
            {
                ser.WriteObject(ms, this);
                File.WriteAllBytes(ConfigPath, ms.ToArray());
            }
        }

        public void Normalize()
        {
            if (string.IsNullOrWhiteSpace(SrcSigExeName)) SrcSigExeName = Defaults.SrcSigExeName;
            if (string.IsNullOrWhiteSpace(ActiveFileName)) ActiveFileName = Defaults.ActiveFileName;
            if (TargetFolder == null) TargetFolder = string.Empty;
        }
    }
}
