// Use the PUBLIC SHA-256 fingerprint from Play Console > App integrity > App signing key certificate.
import {writeFileSync,mkdirSync} from "node:fs";
const fp=(process.argv[2]||"").toUpperCase().trim();
if(!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fp))throw new Error("Provide the Play app-signing SHA-256 fingerprint (32 colon-separated bytes).");
const output=new URL("../../public/.well-known/",import.meta.url);
mkdirSync(output,{recursive:true});
writeFileSync(new URL("assetlinks.json",output),JSON.stringify([{relation:["delegate_permission/common.handle_all_urls"],target:{namespace:"android_app",package_name:"com.hoclaixecungdat.app",sha256_cert_fingerprints:[fp]}}],null,2)+"\n");
console.log("Created public/.well-known/assetlinks.json. Deploy it to the verified www domain.");
