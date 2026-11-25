package com.hoclaixecungdat.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import com.google.androidbrowserhelper.trusted.LauncherActivity;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;

/** APK sideload channel only. Play builds skip this check and use Google Play updates. */
public final class UpdateActivity extends Activity {
    private static final String FEED = "https://raw.githubusercontent.com/thaydatdtlx-hub/hoc-lai-xe-cung-dat/android-play-release-20261125/android-play/updates/latest.json";
    private static final String PACKAGE = "com.hoclaixecungdat.app";
    private static final String APK_PREFIX = "/thaydatdtlx-hub/hoc-lai-xe-cung-dat/releases/download/";
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean resolved = false;
    private final Runnable timeout = () -> openWebsite();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (!BuildConfig.APK_UPDATES) { openWebsite(); return; }
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(32, 32, 32, 32);
        layout.setBackgroundColor(Color.WHITE);
        TextView title = new TextView(this);
        title.setText("Học lái xe cùng Đạt");
        title.setTextSize(23);
        title.setTextColor(Color.rgb(7,24,47));
        layout.addView(title);
        ProgressBar progress = new ProgressBar(this);
        layout.addView(progress);
        TextView status = new TextView(this);
        status.setText("Đang kiểm tra phiên bản...");
        status.setTextSize(14);
        status.setPadding(0,16,0,0);
        layout.addView(status);
        setContentView(layout);
        main.postDelayed(timeout, 6500);
        new Thread(() -> {
            JSONObject info = readFeed();
            main.post(() -> handleFeed(info));
        }, "apk-version-check").start();
    }

    private JSONObject readFeed() {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection)new URL(FEED).openConnection();
            connection.setConnectTimeout(3000);
            connection.setReadTimeout(3000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-cache");
            if (connection.getResponseCode() != 200) return null;
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[2048];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    if (out.size() + n > 32768) return null;
                    out.write(buffer, 0, n);
                }
                return new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) { return null; }
        finally { if (connection != null) connection.disconnect(); }
    }

    private static boolean allowedApk(String value) {
        try {
            Uri uri = Uri.parse(value);
            return "https".equals(uri.getScheme()) && "github.com".equals(uri.getHost())
                && uri.getUserInfo() == null && uri.getPort() == -1 && uri.getQuery() == null
                && uri.getFragment() == null && uri.getPath() != null
                && uri.getPath().startsWith(APK_PREFIX)
                && uri.getPath().substring(APK_PREFIX.length()).matches("[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\\.apk");
        } catch (Exception ignored) { return false; }
    }

    private void handleFeed(JSONObject info) {
        if (resolved || isFinishing() || isDestroyed()) return;
        if (info == null || !PACKAGE.equals(info.optString("packageName"))) { openWebsite(); return; }
        int latest = info.optInt("versionCode", 0);
        int minimum = info.optInt("minimumVersionCode", 0);
        String name = info.optString("versionName", "");
        String url = info.optString("apkUrl", "");
        if (latest <= BuildConfig.VERSION_CODE || minimum < 1 || minimum > latest
                || name.isEmpty() || name.length() > 32 || !allowedApk(url)) { openWebsite(); return; }
        resolved = true;
        main.removeCallbacks(timeout);
        boolean required = minimum > BuildConfig.VERSION_CODE;
        String notes = info.optString("notes", "Cải thiện trải nghiệm và sửa lỗi.");
        if (notes.length() > 1200) notes = notes.substring(0,1200);
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
            .setTitle(required ? "Cần cập nhật ứng dụng" : "Có phiên bản mới")
            .setMessage("Phiên bản hiện tại: " + BuildConfig.VERSION_NAME
                + "\nPhiên bản mới: " + name + "\n\n" + notes
                + "\n\nTải APK và xác nhận cài đặt trên Android. Không cần gỡ ứng dụng cũ nếu chữ ký khớp.")
            .setCancelable(!required)
            .setPositiveButton("Cập nhật ngay", null)
            .setNegativeButton(required ? "Thoát" : "Để sau", (d,w) -> {
                if (required) finish(); else openWebsite();
            });
        AlertDialog dialog = builder.create();
        if (!required) dialog.setOnCancelListener(d -> openWebsite());
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                Intent download = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(download);
                dialog.dismiss();
                finish();
            } catch (ActivityNotFoundException ex) {
                Toast.makeText(this,"Không có trình duyệt để tải APK.",Toast.LENGTH_LONG).show();
            }
        }));
        dialog.show();
    }

    private void openWebsite() {
        if (isFinishing() || isDestroyed()) return;
        resolved = true;
        main.removeCallbacks(timeout);
        startActivity(new Intent(this, LauncherActivity.class));
        finish();
    }
    @Override protected void onDestroy() { main.removeCallbacks(timeout); super.onDestroy(); }
}
