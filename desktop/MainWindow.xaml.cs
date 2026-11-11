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
            Closed += (_, _) => webView.Dispose();
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                // Keep the browser profile writable when installed under Program Files.
                string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BIMClashAuditor", "WebView2");
                var env = await CoreWebView2Environment.CreateAsync(null, profile, new CoreWebView2EnvironmentOptions
                {
                    AdditionalBrowserArguments = "--js-flags=\"--max-old-space-size=4096\""
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
                webView.CoreWebView2.NavigationStarting += (_, args) =>
                {
                    if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) ||
                        uri.Scheme != "https" || uri.Host != "bimclash.local") args.Cancel = true;
                };
                webView.CoreWebView2.NavigationCompleted += (_, args) =>
                {
                    if (!args.IsSuccess) MessageBox.Show("No se pudo cargar la interfaz local: " + args.WebErrorStatus,
                        "BIM Clash Auditor", MessageBoxButton.OK, MessageBoxImage.Error);
                };
                webView.CoreWebView2.Navigate("https://bimclash.local/index.html");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error al inicializar el visor de auditoría: " + ex.Message, "BIM Clash Auditor", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}
