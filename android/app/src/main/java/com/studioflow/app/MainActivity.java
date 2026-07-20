package com.studioflow.app;

import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        // PixelOS es un wrapper de la web en vivo. Para que SIEMPRE muestre la
        // última versión desplegada y nunca quede atascada en HTML/JS cacheado:
        //   1) borramos el caché de la WebView al abrir,
        //   2) forzamos modo sin caché (siempre red).
        WebView webView = this.getBridge().getWebView();
        if (webView != null) {
            webView.clearCache(true);
            WebSettings settings = webView.getSettings();
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        }
    }
}
