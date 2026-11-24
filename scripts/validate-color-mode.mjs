import {readFileSync} from "node:fs";
import {strict as assert} from "node:assert";
import {execFileSync} from "node:child_process";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const js=read("site-color-mode.js");
const init=read("site-color-mode-init.js");
const css=read("site-color-mode.css");
const vite=read("vite.config.js");
const pkg=read("package.json");
for(const file of ["site-color-mode.js","site-color-mode-init.js"]){
  execFileSync(process.execPath,["--check",new URL("../"+file,import.meta.url).pathname],{stdio:"pipe"});
}
for(const mode of ['"system"','"light"','"dark"']){
  assert(js.includes(mode),"Missing selector state "+mode);
  assert(init.includes(mode),"Missing first-paint state "+mode);
}
assert(js.includes('localStorage.setItem(STORAGE_KEY,mode)'),"User preference must persist on device");
assert(js.includes('matchMedia?.("(prefers-color-scheme: dark)")'),"Theme must follow OS when automatic");
assert(js.includes('site-color-control--')&&js.includes('aria-label="Chọn giao diện sáng, tối hoặc theo thiết bị"'),"Accessible theme selector missing");
assert(js.includes('marketing-mobile')&&js.includes('"mobile-menu"'),"Theme must be available on mobile");
assert(js.includes('originalThemeColor'),"Light mode must restore original browser tint");
assert(js.includes('window.addEventListener("storage"'),"Other tabs must synchronize theme preferences");
assert(!/fetch\s*\(|supabase\.|studentRpc\s*\(|\bapp_save_student\b/.test(js),"Theme selector must never send profile or DB updates");
assert(css.includes('html[data-hv-theme="dark"]'),"Dark CSS must be scoped");
assert(css.includes('.site-color-control--login')&&css.includes('mobile-account-menu'),"Theme missing login/mobile treatment");
assert(css.includes('color-scheme:dark')&&css.includes('@media print'),"Native controls and print protection missing");
assert(css.includes('filter:none!important')&&!css.includes('filter:invert'),"Images and photos must not be inverted");
assert(vite.includes("function injectColorMode(html)"),"Vite must inject theme assets into built pages");
assert(vite.includes("html=injectColorMode(html);"),"Theme not applied across all Vite page entries");
assert(vite.includes('src="/site-color-mode.js?v=20261124"'),"Module loader missing");
assert(vite.includes('href="/site-color-mode.css?v=20261124"'),"Theme stylesheet missing");
assert(vite.includes('id="site-color-mode-first-paint"'),"Dark mode must render from first paint");
for(const path of ["index.html","hoc-vien.html","lich-dao-tao.html","250-cau-hoi.html","600-cau-hoi.html","dang-ky-hoc-lai-xe.html"]){
  assert(read(path).startsWith("<!doctype html>")||read(path).startsWith("<!DOCTYPE html>"),"Unexpected HTML page: "+path);
}
assert(pkg.includes("validate-color-mode.mjs"),"Build must run light/dark regression check");
console.log("PASS: Sáng/Tối/Tự động, lưu thiết bị, đồng bộ tab, điều khiển mobile và không thay đổi hồ sơ/biên lai.");
