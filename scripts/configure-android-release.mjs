import fs from 'node:fs';

const path = 'android/app/build.gradle';
const entry = "apply from: rootProject.file('../native/android/release.gradle')";
if (!fs.existsSync(path)) throw new Error('Android project missing. Run Capacitor Android setup first.');
let source = fs.readFileSync(path, 'utf8');
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=')[1];
const versionCode = arg('version-code');
const versionName = arg('version-name');
if (versionCode) {
  if (!/^\d+$/.test(versionCode) || Number(versionCode) <= 13) throw new Error('Expected a version code greater than 13.');
  source = source.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
}
if (versionName) {
  if (!/^\d+(\.\d+)*$/.test(versionName)) throw new Error('Invalid version name.');
  source = source.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
}
if (versionCode || versionName) fs.writeFileSync(path, source);
if (!source.includes(entry)) fs.appendFileSync(path, `\n// Reproducible release metadata and optional existing upload signing.\n${entry}\n`);
const ignore = 'android/.gitignore';
const ignored = fs.readFileSync(ignore, 'utf8');
if (!ignored.includes('\nkeystore.properties')) fs.appendFileSync(ignore, '\n# Private release signing\nkeystore.properties\n*.jks\n*.keystore\n');
console.log('Android release: SYMBOL_TABLE enabled; existing non-obfuscated behavior preserved.');
