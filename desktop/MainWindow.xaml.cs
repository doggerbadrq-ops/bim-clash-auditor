using System;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace BIMClashAuditor
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            Loaded += MainWindow_Loaded;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                // Enable modern features with 4GB memory buffer for heavy IFC models
                var env = await CoreWebView2Environment.CreateAsync(null, null, new CoreWebView2EnvironmentOptions
                {
                    AdditionalBrowserArguments = "--enable-features=SharedArrayBuffer --allow-file-access-from-files --js-flags=\"--max-old-space-size=4096\""
                });

                await webView.EnsureCoreWebView2Async(env);

                // Configure settings for rich AEC graphics
                webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
                webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

                string distPath = Path.Combine(AppContext.BaseDirectory, "web-dist");
                if (!File.Exists(Path.Combine(distPath, "index.html")))
                {
                    throw new FileNotFoundException("Falta la interfaz local en la carpeta web-dist junto al ejecutable.");
                }

                webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "bimclash.local", distPath, CoreWebView2HostResourceAccessKind.DenyCors);
                webView.CoreWebView2.Navigate("https://bimclash.local/index.html");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error al inicializar el visor de auditoría: " + ex.Message, "BIM Clash Auditor", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}
