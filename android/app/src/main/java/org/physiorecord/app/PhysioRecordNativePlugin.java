package org.physiorecord.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * PhysioRecordNativePlugin — Zero-permission native Android bridge for:
 * 1. Native Print / Save as PDF via Android PrintManager (supports all 12 clinical print documents)
 * 2. Storage Access Framework (ACTION_CREATE_DOCUMENT) for .ptbackup, .csv, .ics, .html, .txt exports
 * 3. Native Android Share Sheet via FileProvider (WhatsApp, Telegram, Google Drive, Local Files)
 * 4. Safe External Intent opening for user-initiated WhatsApp and Google Maps links
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
        // Use octet-stream or the provided MIME type so all Android OEM file managers (Samsung, Xiaomi, Huawei, Infinix) allow saving custom extensions like .ptbackup
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

        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) {
                call.reject("Unable to open OutputStream for selected URI.");
                return;
            }
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            out.write(bytes);
            out.flush();

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

            // Sanitize file name to prevent path traversal
            String safeName = new File(filename).getName();
            File outFile = new File(exportDir, safeName);
            try (FileOutputStream fos = new FileOutputStream(outFile, false)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
                fos.flush();
            }

            String authority = getContext().getPackageName() + ".fileprovider";
            Uri contentUri = FileProvider.getUriForFile(getContext(), authority, outFile);

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType != null && !mimeType.isEmpty() ? mimeType : "*/*");
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            if (text != null && !text.isEmpty()) {
                shareIntent.putExtra(Intent.EXTRA_TEXT, text);
            }
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

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

                StringBuilder sb = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
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

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String url = call.getString("url", "");
        boolean isAllowedGithub = url != null
                && url.matches("^https://github\\.com/Hhi5/physiorecord(/releases(/.*)?)?/?(\\?[^\\s#]*)?(#[^\\s]*)?$");
        if (url == null || (!url.startsWith("https://wa.me/")
                && !url.startsWith("https://api.whatsapp.com/")
                && !url.startsWith("https://www.google.com/maps/")
                && !url.startsWith("https://google.com/maps/")
                && !isAllowedGithub)) {
            call.reject("Blocked non-allowlisted external URL.");
            return;
        }

        try {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(viewIntent);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Failed to open external URL: " + ex.getMessage(), ex);
        }
    }
}
