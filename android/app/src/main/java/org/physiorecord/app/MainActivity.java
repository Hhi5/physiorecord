package org.physiorecord.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhysioRecordNativePlugin.class);
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    WebView webView = getBridge().getWebView();
                    webView.evaluateJavascript(
                        "(function() {" +
                        "  var ev = new CustomEvent('physiorecord-hardware-back', { cancelable: true });" +
                        "  var notCancelled = window.dispatchEvent(ev);" +
                        "  return !notCancelled ? 'handled' : 'unhandled';" +
                        "})()",
                        result -> {
                            if (result == null || !result.contains("handled")) {
                                if (webView.canGoBack()) {
                                    webView.goBack();
                                } else {
                                    moveTaskToBack(true);
                                }
                            }
                        }
                    );
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }
}

