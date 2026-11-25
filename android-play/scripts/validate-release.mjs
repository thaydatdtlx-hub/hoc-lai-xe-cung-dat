import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const j=read("app/src/main/java/com/hoclaixecungdat/app/UpdateActivity.java"),m=read("app/src/main/AndroidManifest.xml"),g=read("app/build.gradle");
assert.match(g,/applicationId 'com\.hoclaixecungdat\.app'/);
assert.match(g,/versionCode 5/);assert.match(g,/versionName '1\.1\.3'/);
assert.ok(j.includes("LauncherActivity.class")&&j.includes("openRecovery()")&&j.includes("3500")&&j.includes("18000"));
assert.ok(!j.includes("if (BuildConfig.APK_UPDATES) return;"));
assert.ok(j.includes("allowedApk(url)")&&j.includes("BuildConfig.VERSION_CODE"));
assert.ok(j.includes("https://www.hoclaixecungdat.com/?login=1")&&m.includes("https://www.hoclaixecungdat.com/?login=1"));
assert.ok(m.includes("POST_NOTIFICATIONS")&&m.includes("trusted.DelegationService")&&m.includes("TRUSTED_WEB_ACTIVITY_SERVICE"));
assert.ok(!j.includes("addJavascriptInterface"));
const filepaths=read("app/src/main/res/xml/filepaths.xml");
assert.ok(filepaths.includes('<files-path name="twa_splash" path="twa_splash/"/>'),"Missing narrowly scoped splash FileProvider root");
assert.ok(m.includes('android:exported="false" android:grantUriPermissions="true"'),"FileProvider must remain private");
assert.ok(!filepaths.includes("<root-path")&&!filepaths.includes('path="."' )&&!filepaths.includes('path="/"' ),"Do not expose broader file roots");
for(const component of ["ManageDataLauncherActivity","NotificationPermissionRequestActivity"]) {
  assert.ok(m.includes('android:name="com.google.androidbrowserhelper.trusted.'+component+'"'),"Missing Android Browser Helper activity: "+component);
}
assert.ok(m.includes('android:manageSpaceActivity="com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity"'));
assert.ok(JSON.parse(read("updates/latest.json")).versionCode<5,"Release feed must remain unchanged until signed APK is verified.");
console.log("PASS: Android 1.1.3 configuration; browser-backed launch; bounded update check; recovery; release gate.");
