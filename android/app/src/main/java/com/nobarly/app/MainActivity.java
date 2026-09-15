package com.nobarly.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    private static final int REQ_MIC = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Izin mic untuk voice chat (diminta sekali saat buka app)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
        }

        // Teruskan request mic dari WebView (getUserMedia) ke sistem.
        // Subclass client bawaan Capacitor supaya file chooser (upload gambar)
        // dan dialog JS bawaan tetap jalan normal.
        try {
            final Bridge bridge = this.bridge;
            if (bridge != null && bridge.getWebView() != null
                    && !(bridge.getWebView().getWebChromeClient() instanceof MicGrantChromeClient)) {
                bridge.getWebView().setWebChromeClient(new MicGrantChromeClient(bridge));
            }
        } catch (Exception ignored) {}
    }

    public static class MicGrantChromeClient extends BridgeWebChromeClient {
        public MicGrantChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            try {
                request.grant(request.getResources());
            } catch (Exception e) {
                try {
                    super.onPermissionRequest(request);
                } catch (Exception ignored) {}
            }
        }
    }
}
