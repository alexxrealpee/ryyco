import fs from 'node:fs';
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(manifestPath)) {
 let xml = fs.readFileSync(manifestPath, 'utf8');
 const entries = [
  '<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="ryyco_orders_v2" />',
  '<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_notification" />'
 ];
 for (const entry of entries) {
  const name = entry.match(/android:name="([^"]+)"/)[1];
  const old = new RegExp('<meta-data\\s+android:name="' + name.replaceAll('.', '\\.') + '"[^>]*\\/>');
  xml = old.test(xml) ? xml.replace(old, entry) : xml.replace('</application>', `    ${entry}\n    </application>`);
 }
 if (!/<application[^>]*android:name=/.test(xml)) xml = xml.replace('<application', '<application android:name=".RyycoApplication"');
 for (const permission of ['POST_NOTIFICATIONS', 'VIBRATE']) {
  if (!xml.includes(`android.permission.${permission}`)) xml = xml.replace('</manifest>', `<uses-permission android:name="android.permission.${permission}" /></manifest>`);
 }
 fs.writeFileSync(manifestPath, xml);
 const base = 'android/app/src/main';
 fs.mkdirSync(`${base}/res/raw`, {recursive:true});
 fs.copyFileSync('public/sounds/ryyco-notificacion-3-segundos.mp3', `${base}/res/raw/ryyco_order.mp3`);
 fs.mkdirSync(`${base}/java/com/ryyco/app`, {recursive:true});
 fs.copyFileSync('native/android/RyycoApplication.java', `${base}/java/com/ryyco/app/RyycoApplication.java`);
 // Use the chef outlines from the official vector, in the monochrome format Android requires.
 const chef = fs.readFileSync('public/logo.svg', 'utf8').split('<!-- ICONO DEL CHEF -->')[1];
 const paths = [...chef.matchAll(/<path class="cls-1" d="([^"]+)"/g)].map(match => `<path android:fillColor="#FFFFFFFF" android:pathData="${match[1]}"/>`).join('');
 if (paths.length === 0) throw new Error('Official RYYCO chef vector missing');
 fs.mkdirSync(`${base}/res/drawable`, {recursive:true});
 fs.writeFileSync(`${base}/res/drawable/ic_notification.xml`, `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="280" android:viewportHeight="280">${paths}</vector>`);
 console.log('Android push channel, official chef icon and bundled sound configured.');
}
