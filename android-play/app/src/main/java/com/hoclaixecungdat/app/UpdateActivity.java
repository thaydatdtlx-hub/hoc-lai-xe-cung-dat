package com.hoclaixecungdat.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.view.ViewGroup;
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
    private final Runnable timeout = () -> { if (!resolved) openWebsite(); };
    private final Runnable pageTimeout = () -> showError("Trang tải quá lâu. Vui lòng thử lại hoặc mở bằng Chrome.");
    private static final String HOME = "https://www.hoclaixecungdat.com/?login=1";
    private WebView web;
    private FrameLayout page;
    private LinearLayout errorPanel;
    private ProgressBar progress;
    private TextView status;
    private String retryUrl = HOME;
    private ValueCallback<Uri[]> fileCallback;
    private static final int PICK_FILE = 7201;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
        }
        createLaunchScreen();
        if (state != null) return;
        if (!BuildConfig.APK_UPDATES) { openWebsite(); return; }
        main.postDelayed(timeout, 3500);
        new Thread(() -> {
            JSONObject info = readFeed();
            main.post(() -> handleFeed(info));
        }, "apk-version-check").start();
    }

    private void createLaunchScreen() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(24),dp(24),dp(24),dp(24));
        root.setBackgroundColor(Color.WHITE);
        root.setOnApplyWindowInsetsListener((v,insets) -> {
            v.setPadding(dp(24)+insets.getSystemWindowInsetLeft(),dp(24)+insets.getSystemWindowInsetTop(),
                dp(24)+insets.getSystemWindowInsetRight(),dp(24)+insets.getSystemWindowInsetBottom());
            return insets;
        });
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        root.addView(logo,new LinearLayout.LayoutParams(dp(88),dp(88)));
        TextView label = new TextView(this);
        label.setText("HỌC LÁI XE CÙNG ĐẠT");
        label.setTextSize(21); label.setTextColor(Color.rgb(7,24,47)); label.setGravity(Gravity.CENTER);
        root.addView(label);
        TextView version = new TextView(this);
        version.setText("Phiên bản "+BuildConfig.VERSION_NAME+" · Cổng đào tạo");
        version.setGravity(Gravity.CENTER); version.setPadding(0,dp(12),0,dp(16));
        root.addView(version);
        Button launch = new Button(this);
        launch.setText("Mở ứng dụng");
        launch.setOnClickListener(v -> openWebsite());
        root.addView(launch,new LinearLayout.LayoutParams(-1,-2));
        Button recover = new Button(this);
        recover.setText("Mở chế độ dự phòng");
        recover.setOnClickListener(v -> openRecovery());
        root.addView(recover,new LinearLayout.LayoutParams(-1,-2));
        TextView help = new TextView(this);
        help.setText("Để nhận thông báo nền, hãy dùng Chrome và bật thông báo trong tài khoản. Chế độ dự phòng WebView không hỗ trợ Web Push nền.");
        help.setTextSize(12); help.setGravity(Gravity.CENTER); help.setPadding(0,dp(14),0,0);
        root.addView(help);
        setContentView(root); root.requestApplyInsets();
    }

    private void openRecovery() {
        if (isFinishing() || isDestroyed()) return;
        resolved = true; main.removeCallbacks(timeout);
        if (web != null) { loadPage(HOME); return; }
        createBrowser(); loadPage(HOME);
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
        dialog.setOnCancelListener(d -> { if (!required) openWebsite(); });

        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                Intent download = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(download);
                dialog.dismiss();
                if (required) finish();
            } catch (ActivityNotFoundException ex) {
                Toast.makeText(this,"Không có trình duyệt để tải APK.",Toast.LENGTH_LONG).show();
            }
        }));
        dialog.show();
    }

    private int dp(float n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }

    private static boolean internal(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
            && ("www.hoclaixecungdat.com".equalsIgnoreCase(uri.getHost())
                || "hoclaixecungdat.com".equalsIgnoreCase(uri.getHost()))
            && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private void createBrowser() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setOnApplyWindowInsetsListener((v,insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        page = new FrameLayout(this);
        root.addView(page, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        root.requestApplyInsets();
        initWebView();
    }

    private void initWebView() {
        try {
            web = new WebView(this);
            web.setBackgroundColor(Color.WHITE);
            web.getSettings().setJavaScriptEnabled(true);
            web.getSettings().setDomStorageEnabled(true);
            web.getSettings().setAllowFileAccess(false);
            web.getSettings().setAllowContentAccess(false);
            web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            web.getSettings().setSupportMultipleWindows(false);
            web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
            CookieManager.getInstance().setAcceptCookie(true);
            web.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (!request.isForMainFrame()) return false;
                    return route(request.getUrl());
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return route(Uri.parse(url)); }
                @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                    if (internal(Uri.parse(url))) retryUrl = url;
                    progress.setVisibility(View.VISIBLE);
                    main.removeCallbacks(pageTimeout);
                    main.postDelayed(pageTimeout,18000);
                }
                @Override public void onPageFinished(WebView view, String url) {
                    main.removeCallbacks(pageTimeout);
                    progress.setVisibility(View.GONE);
                    CookieManager.getInstance().flush();
                }
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) showError("Không thể kết nối website. Kiểm tra mạng rồi thử lại.");
                }
                @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                    if (request.isForMainFrame() && response.getStatusCode() >= 400)
                        showError("Website tạm thời không truy cập được (HTTP " + response.getStatusCode() + ").");
                }
                @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    page.removeView(view);
                    view.destroy();
                    web = null;
                    showError("Bộ hiển thị Android gặp lỗi. Hãy thử lại.");
                    return true;
                }
            });
            web.setWebChromeClient(new WebChromeClient() {
                @Override public void onProgressChanged(WebView view, int n) {
                    progress.setProgress(n);
                    if (n == 100) progress.setVisibility(View.GONE);
                }
                @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                    if (fileCallback != null) fileCallback.onReceiveValue(null);
                    fileCallback = callback;
                    try { startActivityForResult(params.createIntent(), PICK_FILE); return true; }
                    catch (RuntimeException ex) { fileCallback.onReceiveValue(null); fileCallback = null; return false; }
                }
            });
            web.setDownloadListener((url,ua,disposition,mime,size) -> {
                Uri uri = Uri.parse(url);
                if ("https".equals(uri.getScheme())) openExternal(uri);
                else Toast.makeText(this,"Tệp này cần mở bằng trình duyệt. Chọn Mở bằng trình duyệt nếu cần.",Toast.LENGTH_LONG).show();
            });
            page.addView(web, 0, new FrameLayout.LayoutParams(-1,-1));
        } catch (RuntimeException ex) {
            web = null;
            showError("Android System WebView chưa sẵn sàng. Hãy cập nhật WebView hoặc mở bằng trình duyệt.");
        }
    }

    private boolean route(Uri uri) {
        if (internal(uri)) return false;
        String scheme = uri.getScheme();
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)
                || "tel".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme)) openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (RuntimeException ex) { Toast.makeText(this,"Không có ứng dụng phù hợp để mở liên kết.",Toast.LENGTH_LONG).show(); }
    }

    private void loadPage(String url) {
        if (errorPanel != null) { page.removeView(errorPanel); errorPanel = null; }
        if (web == null) initWebView();
        if (web != null) { web.setVisibility(View.VISIBLE); progress.setVisibility(View.VISIBLE); web.loadUrl(url); }
    }

    private void showError(String message) {
        if (isFinishing() || isDestroyed() || page == null) return;
        main.removeCallbacks(pageTimeout);
        if (web != null) web.setVisibility(View.GONE);
        progress.setVisibility(View.GONE);
        if (errorPanel != null) page.removeView(errorPanel);
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(28), dp(24), dp(28), dp(24));
        errorPanel.setBackgroundColor(Color.WHITE);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        errorPanel.addView(logo,new LinearLayout.LayoutParams(dp(86),dp(86)));
        TextView title = new TextView(this);
        title.setText("Học lái xe cùng Đạt");
        title.setTextSize(21);
        title.setTextColor(Color.rgb(7,24,47));
        title.setGravity(Gravity.CENTER);
        errorPanel.addView(title);
        status = new TextView(this);
        status.setText(message);
        status.setGravity(Gravity.CENTER);
        status.setTextSize(15);
        status.setPadding(0,dp(14),0,dp(14));
        errorPanel.addView(status);
        Button retry = new Button(this);
        retry.setText("Thử lại");
        retry.setOnClickListener(v -> loadPage(retryUrl));
        errorPanel.addView(retry,new LinearLayout.LayoutParams(-1,-2));
        Button browser = new Button(this);
        browser.setText("Mở bằng trình duyệt");
        browser.setOnClickListener(v -> openWebsite());
        errorPanel.addView(browser,new LinearLayout.LayoutParams(-1,-2));
        page.addView(errorPanel,new FrameLayout.LayoutParams(-1,-1));
    }

    private void openWebsite() {
        if (isFinishing() || isDestroyed()) return;
        resolved = true;
        main.removeCallbacks(timeout);
        // All variants use a browser-backed launcher for Web Push.
        // Android Browser Helper uses a verified TWA or Custom Tabs when verification is unavailable.
        try {
            Intent probe = new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/"));
            probe.addCategory(Intent.CATEGORY_BROWSABLE);
            if (probe.resolveActivity(getPackageManager()) == null) { openRecovery(); return; }
            Intent intent = new Intent(this, LauncherActivity.class);
            intent.setData(Uri.parse(HOME));
            startActivity(intent);
            finish();
        } catch (RuntimeException ex) { openRecovery(); }
    }

    private void navigateBack() {
        if (web != null && web.canGoBack()) {
            if (errorPanel != null) { page.removeView(errorPanel); errorPanel = null; web.setVisibility(View.VISIBLE); }
            web.goBack();
        } else finish();
    }

    @Override public boolean onKeyUp(int keyCode, android.view.KeyEvent event) {
        if (Build.VERSION.SDK_INT < 33 && keyCode == android.view.KeyEvent.KEYCODE_BACK) {
            navigateBack();
            return true;
        }
        return super.onKeyUp(keyCode,event);
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data));
            fileCallback = null;
        }
    }
    @Override protected void onDestroy() {
        resolved = true;
        main.removeCallbacks(timeout);
        main.removeCallbacks(pageTimeout);
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (web != null) { page.removeView(web); web.destroy(); web = null; }
        super.onDestroy();
    }
}
