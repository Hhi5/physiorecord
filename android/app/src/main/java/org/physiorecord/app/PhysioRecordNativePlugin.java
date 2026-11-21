package org.physiorecord.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.webkit.WebView;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * PhysioRecordNativePlugin — Zero-permission native Android bridge for:
 * 1. Native Print / Save as PDF via Android PrintManager (supports all 12 clinical print documents)
 * 2. Storage Access Framework (ACTION_CREATE_DOCUMENT & ACTION_OPEN_DOCUMENT) with Google Drive sync() support
 * 3. Native Android Share Sheet via FileProvider with ClipData URI permissions (Google Drive, WhatsApp, Files)
 * 4. Safe External Intent opening and Native PKCE Loopback OAuth via system browser
 */
@CapacitorPlugin(name = "PhysioRecordNative")
public class PhysioRecordNativePlugin extends Plugin {

    @PluginMethod
    public void printCurrentPage(PluginCall call) {
        final String jobName = call.getString("jobName", "PhysioRecord_Document");
        final Activity activity = getActivity();
        if (activity == null || bridge == null || bridge.getWebView() == null) {
            call.reject("WebView or Activity unavailable for printing.");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                WebView webView = bridge.getWebView();
                PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) {
                    call.reject("Android PrintManager service unavailable on this device.");
                    return;
                }
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                PrintAttributes attributes = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .build();
                printManager.print(jobName, adapter, attributes);

                JSObject ret = new JSObject();
                ret.put("printed", true);
                call.resolve(ret);
            } catch (Exception ex) {
                call.reject("Failed to launch Android PrintManager: " + ex.getMessage(), ex);
            }
        });
    }

    @PluginMethod
    public void saveFileToDevice(PluginCall call) {
        String filename = call.getString("filename", "PhysioRecord_Export.ptbackup");
        String content = call.getString("content", "");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (content == null) {
            call.reject("File content is required.");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // Use octet-stream or the provided MIME type so Android OEM file managers & Google Drive SAF allow saving custom extensions
        intent.setType(mimeType != null && !mimeType.isEmpty() ? mimeType : "application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE, filename);

        startActivityForResult(call, intent, "handleSaveDocumentResult");
    }

    @ActivityCallback
    private void handleSaveDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject cancelledRet = new JSObject();
            cancelledRet.put("saved", false);
            cancelledRet.put("cancelled", true);
            call.resolve(cancelledRet);
            return;
        }

        Uri uri = result.getData().getData();
        String content = call.getString("content", "");
        String filename = call.getString("filename", "PhysioRecord_Export.ptbackup");
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);

        try {
            boolean writtenViaPfd = false;
            try (ParcelFileDescriptor pfd = getContext().getContentResolver().openFileDescriptor(uri, "w")) {
                if (pfd != null) {
                    try (FileOutputStream fos = new FileOutputStream(pfd.getFileDescriptor())) {
                        fos.write(bytes);
                        fos.flush();
                        // Explicit sync() is required by Google Drive DocumentProvider on Android 7-15 so files are never uploaded empty (0 bytes)
                        try {
                            pfd.getFileDescriptor().sync();
                        } catch (Exception ignored) {
                        }
                    }
                    writtenViaPfd = true;
                }
            } catch (Exception ignored) {
                // Fall back to openOutputStream if provider does not support ParcelFileDescriptor write mode
            }

            if (!writtenViaPfd) {
                try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (out == null) {
                        call.reject("Unable to open OutputStream for selected URI.");
                        return;
                    }
                    out.write(bytes);
                    out.flush();
                }
            }

            JSObject ret = new JSObject();
            ret.put("saved", true);
            ret.put("cancelled", false);
            ret.put("uri", uri.toString());
            ret.put("filename", filename);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Failed writing file via SAF: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void openFileFromDevice(PluginCall call) {
        String mimeType = call.getString("mimeType", "*/*");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType != null && !mimeType.isEmpty() ? mimeType : "*/*");
        startActivityForResult(call, intent, "handleOpenDocumentResult");
    }

    @ActivityCallback
    private void handleOpenDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject cancelledRet = new JSObject();
            cancelledRet.put("opened", false);
            cancelledRet.put("cancelled", true);
            call.resolve(cancelledRet);
            return;
        }

        Uri uri = result.getData().getData();
        String displayName = "sync.ptsync.json";
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.isEmpty()) {
                        displayName = name;
                    }
                }
            }
        } catch (Exception ignored) {
        }

        final int maxBytes = 35 * 1024 * 1024;
        try (InputStream is = getContext().getContentResolver().openInputStream(uri)) {
            if (is == null) {
                call.reject("Unable to open selected file.");
                return;
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int total = 0;
            int read;
            while ((read = is.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) {
                    call.reject("Selected file exceeds 35MB safety limit.");
                    return;
                }
                baos.write(buffer, 0, read);
            }
            String content = baos.toString("UTF-8");

            JSObject ret = new JSObject();
            ret.put("opened", true);
            ret.put("cancelled", false);
            ret.put("filename", displayName);
            ret.put("content", content);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Failed reading selected file: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String filename = call.getString("filename", "PhysioRecord_Export.ptbackup");
        String content = call.getString("content", "");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String title = call.getString("title", filename);
        String text = call.getString("text", "");

        try {
            File exportDir = new File(getContext().getCacheDir(), "exports");
            if (!exportDir.exists() && !exportDir.mkdirs()) {
                call.reject("Could not create temporary export cache directory.");
                return;
            }

            // Sanitize file name and enforce canonical directory containment
            String safeName = new File(filename != null ? filename : "PhysioRecord_Export.ptbackup").getName();
            safeName = safeName.replaceAll("[\\u0000-\\u001F\\u007F<>:\"/\\\\|?*]", "");
            if (safeName.isEmpty() || ".".equals(safeName) || "..".equals(safeName)) {
                call.reject("Invalid export filename.");
                return;
            }
            File outFile = new File(exportDir, safeName);
            String canonicalExportDir = exportDir.getCanonicalPath();
            String canonicalOutFile = outFile.getCanonicalPath();
            if (!canonicalOutFile.startsWith(canonicalExportDir + File.separator)) {
                call.reject("Blocked export path outside cache directory.");
                return;
            }
            try (FileOutputStream fos = new FileOutputStream(outFile, false)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
                fos.flush();
                try {
                    fos.getFD().sync();
                } catch (Exception ignored) {
                }
            }

            String authority = getContext().getPackageName() + ".fileprovider";
            Uri contentUri = FileProvider.getUriForFile(getContext(), authority, outFile);

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            String effectiveMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "*/*";
            shareIntent.setType(effectiveMime);
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            if (text != null && !text.isEmpty()) {
                shareIntent.putExtra(Intent.EXTRA_TEXT, text);
            }
            // Attach ClipData so Android 10-15 Share Sheet properly propagates READ URI permission to Google Drive ("Save to Drive")
            shareIntent.setClipData(ClipData.newRawUri(safeName, contentUri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Activity activity = getActivity();
            if (activity != null) {
                activity.runOnUiThread(() -> activity.startActivity(chooser));
            } else {
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }

            JSObject ret = new JSObject();
            ret.put("shared", true);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Failed to share file on Android: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void getAppVersionInfo(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageManager pm = ctx.getPackageManager();
            String pkgName = ctx.getPackageName();
            PackageInfo info = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    ? pm.getPackageInfo(pkgName, PackageManager.PackageInfoFlags.of(0))
                    : pm.getPackageInfo(pkgName, 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? info.getLongVersionCode()
                    : info.versionCode;

            JSObject ret = new JSObject();
            ret.put("packageName", pkgName);
            ret.put("versionName", info.versionName != null ? info.versionName : "1.0.0");
            ret.put("versionCode", versionCode);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Failed reading Android PackageInfo: " + ex.getMessage(), ex);
        }
    }

    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void fetchGitHubReleases(PluginCall call) {
        networkExecutor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL apiUrl = new URL("https://api.github.com/repos/Hhi5/physiorecord/releases?per_page=10");
                conn = (HttpURLConnection) apiUrl.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setRequestProperty("Accept", "application/vnd.github+json");
                conn.setRequestProperty("User-Agent", "PhysioRecord-Android");

                int status = conn.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("GitHub API returned HTTP " + status);
                    return;
                }

                final int maxResponseChars = 5 * 1024 * 1024;
                StringBuilder sb = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (sb.length() + line.length() > maxResponseChars) {
                            call.reject("GitHub API response exceeded 5MB safety limit.");
                            return;
                        }
                        sb.append(line);
                    }
                }

                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("releasesJson", sb.toString());
                call.resolve(ret);
            } catch (Exception ex) {
                call.reject("Failed fetching GitHub Releases: " + ex.getMessage(), ex);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    private boolean isAllowedExternalUri(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return false;
        }
        String trimmed = rawUrl.trim();
        for (int i = 0; i < trimmed.length(); i++) {
            char ch = trimmed.charAt(i);
            if (ch < 0x20 || ch == 0x7F) return false;
        }
        Uri uri = Uri.parse(trimmed);
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        if (uri.getUserInfo() != null && !uri.getUserInfo().isEmpty()) {
            return false;
        }
        int port = uri.getPort();
        if (port != -1 && port != 443) {
            return false;
        }
        String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
        String path = uri.getPath() != null ? uri.getPath() : "";
        if ("wa.me".equals(host) || "api.whatsapp.com".equals(host)) {
            return true;
        }
        if ("google.com".equals(host) || "www.google.com".equals(host)) {
            return "/maps".equals(path) || path.startsWith("/maps/");
        }
        if ("github.com".equals(host)) {
            return path.matches("(?i)^/Hhi5/physiorecord(/releases(/[^?#\\s]*)?)?/?$");
        }
        return false;
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!isAllowedExternalUri(url)) {
            call.reject("Blocked non-allowlisted external URL.");
            return;
        }

        try {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()));
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(viewIntent);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Failed to open external URL: " + ex.getMessage(), ex);
        }
    }

    private volatile ServerSocket activeOAuthServer = null;
    private final ExecutorService oauthExecutor = Executors.newCachedThreadPool();

    private static String randomBase64Url(int byteLen) {
        byte[] bytes = new byte[byteLen];
        new SecureRandom().nextBytes(bytes);
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static String sha256Base64Url(String input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(input.getBytes(StandardCharsets.US_ASCII));
        return Base64.encodeToString(digest, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static Map<String, String> parseQueryParams(String query) throws Exception {
        Map<String, String> map = new HashMap<>();
        if (query == null || query.isEmpty()) return map;
        String[] pairs = query.split("&");
        for (String pair : pairs) {
            int eq = pair.indexOf('=');
            if (eq > 0) {
                String k = URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                String v = URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
                map.put(k, v);
            }
        }
        return map;
    }

    private static String readAllStream(InputStream is) throws Exception {
        if (is == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }

    /**
     * Native Android OAuth 2.0 PKCE loopback flow via system browser (Chrome).
     * Avoids WebView disallowed_useragent and broken Firebase popup windows on Android.
     * Requires a Google Cloud "Desktop app" OAuth Client ID (supports 127.0.0.1 loopback redirect).
     */
    @PluginMethod
    public void startGoogleDriveOAuth(PluginCall call) {
        String rawClientId = call.getString("clientId", "");
        String rawClientSecret = call.getString("clientSecret", "");
        String rawScope = call.getString(
                "scope",
                "https://www.googleapis.com/auth/drive.file openid email profile"
        );
        final String clientId = rawClientId != null ? rawClientId.trim() : "";
        final String clientSecret = rawClientSecret != null ? rawClientSecret.trim() : "";
        final String scope = rawScope != null && !rawScope.trim().isEmpty()
                ? rawScope.trim()
                : "https://www.googleapis.com/auth/drive.file openid email profile";

        if (clientId.isEmpty() || !clientId.endsWith(".apps.googleusercontent.com")) {
            call.reject("Invalid Google OAuth Client ID.");
            return;
        }

        // Cancel any lingering previous OAuth server socket
        ServerSocket prev = activeOAuthServer;
        if (prev != null) {
            try {
                prev.close();
            } catch (Exception ignored) {
            }
            activeOAuthServer = null;
        }

        oauthExecutor.execute(() -> {
            ServerSocket server = null;
            final java.util.concurrent.atomic.AtomicBoolean launchFailed =
                    new java.util.concurrent.atomic.AtomicBoolean(false);
            try {
                final ServerSocket boundServer = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
                server = boundServer;
                server.setSoTimeout(180_000);
                activeOAuthServer = server;

                int port = server.getLocalPort();
                String redirectUri = "http://127.0.0.1:" + port + "/oauth2callback";
                String state = randomBase64Url(24);
                String codeVerifier = randomBase64Url(48);
                String codeChallenge = sha256Base64Url(codeVerifier);

                String authUrl = "https://accounts.google.com/o/oauth2/v2/auth"
                        + "?client_id=" + URLEncoder.encode(clientId, "UTF-8")
                        + "&redirect_uri=" + URLEncoder.encode(redirectUri, "UTF-8")
                        + "&response_type=code"
                        + "&scope=" + URLEncoder.encode(scope, "UTF-8")
                        + "&state=" + URLEncoder.encode(state, "UTF-8")
                        + "&code_challenge=" + URLEncoder.encode(codeChallenge, "UTF-8")
                        + "&code_challenge_method=S256"
                        + "&prompt=select_account";

                Activity activity = getActivity();
                if (activity == null) {
                    call.reject("Activity unavailable for OAuth sign-in.");
                    return;
                }
                activity.runOnUiThread(() -> {
                    try {
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(authUrl));
                        browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(browserIntent);
                    } catch (Exception ex) {
                        launchFailed.set(true);
                        try {
                            boundServer.close();
                        } catch (Exception ignored) {
                        }
                        call.reject("Could not launch system browser: " + ex.getMessage(), ex);
                    }
                });

                String authCode = null;
                String oauthError = null;
                long deadline = System.currentTimeMillis() + 180_000L;

                while (authCode == null && oauthError == null && System.currentTimeMillis() < deadline) {
                    try (Socket client = server.accept()) {
                        client.setSoTimeout(5000);
                        BufferedReader reader = new BufferedReader(
                                new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8)
                        );
                        String requestLine = reader.readLine();
                        if (requestLine == null) continue;
                        // Drain remaining HTTP request headers so Chrome does not observe a TCP RST on close
                        String headerLine;
                        int headerCount = 0;
                        while (headerCount < 64 && (headerLine = reader.readLine()) != null && !headerLine.isEmpty()) {
                            headerCount++;
                        }
                        String[] parts = requestLine.split(" ");
                        String rawPath = parts.length >= 2 ? parts[1] : "/";
                        if (!rawPath.startsWith("/oauth2callback")) {
                            String notFound = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                            client.getOutputStream().write(notFound.getBytes(StandardCharsets.UTF_8));
                            continue;
                        }
                        int qIdx = rawPath.indexOf('?');
                        String query = qIdx >= 0 ? rawPath.substring(qIdx + 1) : "";
                        Map<String, String> params = parseQueryParams(query);
                        String returnedState = params.get("state");
                        String returnedError = params.get("error");
                        String returnedCode = params.get("code");

                        boolean ok = returnedError == null
                                && returnedCode != null
                                && !returnedCode.isEmpty()
                                && state.equals(returnedState);

                        String htmlBody = ok
                                ? "<!doctype html><html dir=\"rtl\" lang=\"ar\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>PhysioRecord</title><style>body{font-family:sans-serif;text-align:center;padding:48px 20px;background:#f0fdf4;color:#065f46;}h2{margin-bottom:8px;}</style></head><body><h2>تم ربط Google Drive بنجاح</h2><p>يمكنك إغلاق هذه الصفحة والعودة إلى تطبيق PhysioRecord.</p><p dir=\"ltr\">Connected successfully. Return to PhysioRecord.</p></body></html>"
                                : "<!doctype html><html dir=\"rtl\" lang=\"ar\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>PhysioRecord</title><style>body{font-family:sans-serif;text-align:center;padding:48px 20px;background:#fef2f2;color:#991b1b;}</style></head><body><h2>تعذّر إكمال تسجيل الدخول</h2><p>يرجى العودة إلى تطبيق PhysioRecord والمحاولة مجدداً.</p></body></html>";

                        byte[] bodyBytes = htmlBody.getBytes(StandardCharsets.UTF_8);
                        String httpResp = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "
                                + bodyBytes.length + "\r\nConnection: close\r\n\r\n";
                        OutputStream out = client.getOutputStream();
                        out.write(httpResp.getBytes(StandardCharsets.UTF_8));
                        out.write(bodyBytes);
                        out.flush();

                        if (ok) {
                            authCode = returnedCode;
                        } else {
                            oauthError = returnedError != null ? returnedError : "state_mismatch";
                        }
                    } catch (SocketTimeoutException timeout) {
                        oauthError = "timeout";
                    }
                }

                if (launchFailed.get()) {
                    return;
                }

                if (oauthError != null || authCode == null) {
                    call.reject("OAuth cancelled or failed: " + (oauthError != null ? oauthError : "timeout"));
                    return;
                }

                // Exchange authorization code for OAuth access token over HTTPS
                StringBuilder formBody = new StringBuilder();
                formBody.append("code=").append(URLEncoder.encode(authCode, "UTF-8"))
                        .append("&client_id=").append(URLEncoder.encode(clientId, "UTF-8"))
                        .append("&redirect_uri=").append(URLEncoder.encode(redirectUri, "UTF-8"))
                        .append("&grant_type=authorization_code")
                        .append("&code_verifier=").append(URLEncoder.encode(codeVerifier, "UTF-8"));
                if (!clientSecret.isEmpty()) {
                    formBody.append("&client_secret=").append(URLEncoder.encode(clientSecret, "UTF-8"));
                }

                HttpURLConnection tokenConn = (HttpURLConnection) new URL("https://oauth2.googleapis.com/token").openConnection();
                tokenConn.setRequestMethod("POST");
                tokenConn.setConnectTimeout(10_000);
                tokenConn.setReadTimeout(10_000);
                tokenConn.setDoOutput(true);
                tokenConn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                try (OutputStream os = tokenConn.getOutputStream()) {
                    os.write(formBody.toString().getBytes(StandardCharsets.UTF_8));
                }

                int tokenStatus = tokenConn.getResponseCode();
                String tokenRespStr = readAllStream(
                        tokenStatus >= 200 && tokenStatus < 300
                                ? tokenConn.getInputStream()
                                : tokenConn.getErrorStream()
                );
                tokenConn.disconnect();

                if (tokenStatus < 200 || tokenStatus >= 300) {
                    call.reject("Google token exchange failed (HTTP " + tokenStatus + "): " + tokenRespStr);
                    return;
                }

                JSONObject tokenJson = new JSONObject(tokenRespStr);
                String accessToken = tokenJson.optString("access_token", "");
                if (accessToken.isEmpty()) {
                    call.reject("Google did not return an access token.");
                    return;
                }

                String email = "";
                String displayName = "";
                String photoURL = "";
                try {
                    HttpURLConnection infoConn = (HttpURLConnection) new URL("https://www.googleapis.com/oauth2/v3/userinfo").openConnection();
                    infoConn.setRequestMethod("GET");
                    infoConn.setConnectTimeout(8_000);
                    infoConn.setReadTimeout(8_000);
                    infoConn.setRequestProperty("Authorization", "Bearer " + accessToken);
                    if (infoConn.getResponseCode() == 200) {
                        JSONObject infoJson = new JSONObject(readAllStream(infoConn.getInputStream()));
                        email = infoJson.optString("email", "");
                        displayName = infoJson.optString("name", "");
                        photoURL = infoJson.optString("picture", "");
                    }
                    infoConn.disconnect();
                } catch (Exception ignored) {
                }

                JSObject ret = new JSObject();
                ret.put("accessToken", accessToken);
                ret.put("email", email);
                ret.put("displayName", displayName);
                ret.put("photoURL", photoURL);
                call.resolve(ret);
            } catch (Exception ex) {
                if (!launchFailed.get()) {
                    call.reject("Native Google Drive OAuth failed: " + ex.getMessage(), ex);
                }
            } finally {
                if (server != null) {
                    try {
                        server.close();
                    } catch (Exception ignored) {
                    }
                }
                if (activeOAuthServer == server) {
                    activeOAuthServer = null;
                }
            }
        });
    }

    // -----------------------------------------------------------------------
    // 6. Hardware-Backed Android BiometricPrompt + Android Keystore Vault Unlock
    //    Wraps the 256-bit vault DEK with an Android Keystore AES-256-GCM key
    //    requiring BIOMETRIC_STRONG CryptoObject verification on every use.
    // -----------------------------------------------------------------------
    private static final String BIOMETRIC_KEY_ALIAS = "org.physiorecord.vault.biometric.dek.v1";
    private static final String BIOMETRIC_PREFS_NAME = "physiorecord_biometric_vault";
    private static final String BIOMETRIC_PREF_CIPHERTEXT = "wrapped_dek_b64";
    private static final String BIOMETRIC_PREF_IV = "wrapped_dek_iv_b64";

    private SharedPreferences getBiometricPrefs(Context ctx) {
        return ctx.getSharedPreferences(BIOMETRIC_PREFS_NAME, Context.MODE_PRIVATE);
    }

    private void deleteBiometricArtifacts(Context ctx) {
        try {
            getBiometricPrefs(ctx).edit().clear().apply();
        } catch (Exception ignored) {
        }
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            if (ks.containsAlias(BIOMETRIC_KEY_ALIAS)) {
                ks.deleteEntry(BIOMETRIC_KEY_ALIAS);
            }
        } catch (Exception ignored) {
        }
    }

    private boolean isBiometricDekStored(Context ctx) {
        try {
            SharedPreferences prefs = getBiometricPrefs(ctx);
            String ct = prefs.getString(BIOMETRIC_PREF_CIPHERTEXT, null);
            String iv = prefs.getString(BIOMETRIC_PREF_IV, null);
            if (ct == null || ct.isEmpty() || iv == null || iv.isEmpty()) {
                return false;
            }
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            return ks.containsAlias(BIOMETRIC_KEY_ALIAS);
        } catch (Exception ex) {
            return false;
        }
    }

    private SecretKey generateBiometricKeystoreKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(BIOMETRIC_KEY_ALIAS)) {
            ks.deleteEntry(BIOMETRIC_KEY_ALIAS);
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
        );
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
                BIOMETRIC_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        } else {
            // Require fresh BiometricPrompt CryptoObject authentication per operation on API 24-29
            builder.setUserAuthenticationValidityDurationSeconds(-1);
        }

        keyGenerator.init(builder.build());
        return keyGenerator.generateKey();
    }

    private SecretKey loadBiometricKeystoreKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        return (SecretKey) ks.getKey(BIOMETRIC_KEY_ALIAS, null);
    }

    @PluginMethod
    public void isBiometricAvailable(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            JSObject ret = new JSObject();
            ret.put("available", false);
            ret.put("status", "unavailable");
            ret.put("enrolled", false);
            call.resolve(ret);
            return;
        }

        int canAuth = BiometricManager.from(ctx)
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        String status;
        switch (canAuth) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                status = "ready";
                break;
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                status = "none_enrolled";
                break;
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                status = "no_hardware";
                break;
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                status = "hw_unavailable";
                break;
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                status = "security_update_required";
                break;
            default:
                status = "unavailable";
                break;
        }

        JSObject ret = new JSObject();
        ret.put("available", canAuth == BiometricManager.BIOMETRIC_SUCCESS);
        ret.put("status", status);
        ret.put("enrolled", isBiometricDekStored(ctx));
        call.resolve(ret);
    }

    @PluginMethod
    public void hasBiometricDek(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("enrolled", ctx != null && isBiometricDekStored(ctx));
        call.resolve(ret);
    }

    @PluginMethod
    public void clearBiometricDek(PluginCall call) {
        Context ctx = getContext();
        if (ctx != null) {
            deleteBiometricArtifacts(ctx);
        }
        JSObject ret = new JSObject();
        ret.put("cleared", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void enrollBiometricDek(PluginCall call) {
        final String dekBase64 = call.getString("dekBase64", "");
        final String title = call.getString("title", "تفعيل الفتح بالبصمة");
        final String subtitle = call.getString("subtitle", "استخدم بصمة الإصبع لحماية مفتاح الخزينة");
        final String negativeLabel = call.getString("negativeLabel", "إلغاء");

        final Activity rawActivity = getActivity();
        if (!(rawActivity instanceof FragmentActivity)) {
            call.reject("Biometric prompt requires an active Android FragmentActivity.");
            return;
        }
        final FragmentActivity activity = (FragmentActivity) rawActivity;

        final byte[] rawDek;
        try {
            rawDek = Base64.decode(dekBase64, Base64.DEFAULT);
        } catch (Exception ex) {
            call.reject("Invalid DEK payload.");
            return;
        }
        if (rawDek == null || rawDek.length != 32) {
            if (rawDek != null) Arrays.fill(rawDek, (byte) 0);
            call.reject("DEK must be exactly 32 bytes.");
            return;
        }

        int canAuth = BiometricManager.from(activity)
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
            Arrays.fill(rawDek, (byte) 0);
            if (canAuth == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
                call.reject("لم يتم تسجيل بصمة إصبع على الجهاز. أضف بصمة من إعدادات أندرويد أولاً.");
            } else {
                call.reject("المصادقة الحيوية القوية (البصمة) غير متوفرة على هذا الجهاز.");
            }
            return;
        }

        final Cipher cipher;
        try {
            SecretKey secretKey = generateBiometricKeystoreKey();
            cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);
        } catch (Exception ex) {
            Arrays.fill(rawDek, (byte) 0);
            call.reject("تعذر تهيئة مفتاح البصمة الآمن: " + ex.getMessage(), ex);
            return;
        }

        activity.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setNegativeButtonText(negativeLabel)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setConfirmationRequired(false)
                    .build();

            BiometricPrompt prompt = new BiometricPrompt(
                    activity,
                    ContextCompat.getMainExecutor(activity),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            try {
                                BiometricPrompt.CryptoObject cryptoObj = result.getCryptoObject();
                                Cipher authedCipher = cryptoObj != null ? cryptoObj.getCipher() : null;
                                if (authedCipher == null) {
                                    call.reject("تعذر التحقق من وحدة التشفير الحيوية.");
                                    return;
                                }
                                byte[] ciphertext = authedCipher.doFinal(rawDek);
                                byte[] iv = authedCipher.getIV();
                                getBiometricPrefs(activity)
                                        .edit()
                                        .putString(BIOMETRIC_PREF_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                                        .putString(BIOMETRIC_PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                                        .apply();
                                JSObject ret = new JSObject();
                                ret.put("enrolled", true);
                                call.resolve(ret);
                            } catch (Exception ex) {
                                deleteBiometricArtifacts(activity);
                                call.reject("فشل حفظ مفتاح البصمة المشفر: " + ex.getMessage(), ex);
                            } finally {
                                Arrays.fill(rawDek, (byte) 0);
                            }
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                            Arrays.fill(rawDek, (byte) 0);
                            deleteBiometricArtifacts(activity);
                            call.reject(errString != null && errString.length() > 0
                                    ? errString.toString()
                                    : "تم إلغاء المصادقة بالبصمة.");
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // BiometricPrompt keeps the sheet open for retries
                        }
                    }
            );

            try {
                prompt.authenticate(promptInfo, new BiometricPrompt.CryptoObject(cipher));
            } catch (Exception ex) {
                Arrays.fill(rawDek, (byte) 0);
                deleteBiometricArtifacts(activity);
                call.reject("تعذر عرض نافذة البصمة: " + ex.getMessage(), ex);
            }
        });
    }

    @PluginMethod
    public void unlockBiometricDek(PluginCall call) {
        final String title = call.getString("title", "فتح خزينة PhysioRecord");
        final String subtitle = call.getString("subtitle", "ضع إصبعك لفتح السجلات المشفرة");
        final String negativeLabel = call.getString("negativeLabel", "استخدام كلمة المرور");

        final Activity rawActivity = getActivity();
        if (!(rawActivity instanceof FragmentActivity)) {
            call.reject("Biometric prompt requires an active Android FragmentActivity.");
            return;
        }
        final FragmentActivity activity = (FragmentActivity) rawActivity;

        SharedPreferences prefs = getBiometricPrefs(activity);
        String ctB64 = prefs.getString(BIOMETRIC_PREF_CIPHERTEXT, null);
        String ivB64 = prefs.getString(BIOMETRIC_PREF_IV, null);
        if (ctB64 == null || ctB64.isEmpty() || ivB64 == null || ivB64.isEmpty()) {
            call.reject("لم يتم تفعيل الفتح بالبصمة على هذا الجهاز.");
            return;
        }

        final byte[] ciphertext;
        final byte[] iv;
        try {
            ciphertext = Base64.decode(ctB64, Base64.DEFAULT);
            iv = Base64.decode(ivB64, Base64.DEFAULT);
        } catch (Exception ex) {
            deleteBiometricArtifacts(activity);
            call.reject("بيانات البصمة المحفوظة تالفة. افتح بكلمة المرور ثم أعد التفعيل.");
            return;
        }

        final Cipher cipher;
        try {
            SecretKey secretKey = loadBiometricKeystoreKey();
            if (secretKey == null) {
                deleteBiometricArtifacts(activity);
                call.reject("مفتاح البصمة غير موجود. افتح بكلمة المرور الرئيسية ثم أعد تفعيل البصمة.");
                return;
            }
            cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(128, iv));
        } catch (KeyPermanentlyInvalidatedException invEx) {
            deleteBiometricArtifacts(activity);
            call.reject("تغيرت بصمات الجهاز، لذلك تم إبطال مفتاح البصمة تلقائياً لحماية البيانات. افتح بكلمة المرور الرئيسية ثم أعد تفعيل البصمة.");
            return;
        } catch (Exception ex) {
            call.reject("تعذر تهيئة فك التشفير بالبصمة: " + ex.getMessage(), ex);
            return;
        }

        activity.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setNegativeButtonText(negativeLabel)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setConfirmationRequired(false)
                    .build();

            BiometricPrompt prompt = new BiometricPrompt(
                    activity,
                    ContextCompat.getMainExecutor(activity),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            byte[] rawDek = null;
                            try {
                                BiometricPrompt.CryptoObject cryptoObj = result.getCryptoObject();
                                Cipher authedCipher = cryptoObj != null ? cryptoObj.getCipher() : null;
                                if (authedCipher == null) {
                                    call.reject("تعذر التحقق من وحدة التشفير الحيوية.");
                                    return;
                                }
                                rawDek = authedCipher.doFinal(ciphertext);
                                String dekB64 = Base64.encodeToString(rawDek, Base64.NO_WRAP);
                                JSObject ret = new JSObject();
                                ret.put("dekBase64", dekB64);
                                call.resolve(ret);
                            } catch (Exception ex) {
                                call.reject("فشل فك تشفير مفتاح الخزينة بالبصمة: " + ex.getMessage(), ex);
                            } finally {
                                if (rawDek != null) Arrays.fill(rawDek, (byte) 0);
                            }
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                            call.reject(errString != null && errString.length() > 0
                                    ? errString.toString()
                                    : "تم إلغاء الفتح بالبصمة.");
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // User can retry fingerprint
                        }
                    }
            );

            try {
                prompt.authenticate(promptInfo, new BiometricPrompt.CryptoObject(cipher));
            } catch (Exception ex) {
                call.reject("تعذر عرض نافذة البصمة: " + ex.getMessage(), ex);
            }
        });
    }
}
