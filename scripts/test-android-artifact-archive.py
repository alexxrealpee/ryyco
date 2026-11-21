import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit-android-bundle.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class ArchiveTests(unittest.TestCase):
    def make_bundle(self, path, diagnostics=False):
        with zipfile.ZipFile(path, 'w') as bundle:
            bundle.writestr('BundleConfig.pb', b'test fixture')
            bundle.writestr('base/manifest/AndroidManifest.xml', b'test fixture')
            if diagnostics:
                bundle.writestr('BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map', b'exact mapping')
                bundle.writestr('BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libtest.so.sym', b'exact symbols')

    def test_no_fabricated_diagnostics_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'input.aab'
            self.make_bundle(source)
            result = audit.archive_bundle(source, root / 'release')
            self.assertFalse(result['mapping_embedded'])
            self.assertEqual(result['native_symbols_embedded'], [])
            self.assertFalse((root / 'release/mapping.txt').exists())
            self.assertFalse((root / 'release/native-debug-symbols.zip').exists())
            self.assertEqual(result['sha256']['ryyco-release.aab'], hashlib.sha256(source.read_bytes()).hexdigest())
            with self.assertRaises(FileExistsError):
                audit.archive_bundle(source, root / 'release')

    def test_extracts_only_diagnostics_from_same_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'input.aab'
            self.make_bundle(source, True)
            audit.archive_bundle(source, root / 'release')
            self.assertEqual((root / 'release/mapping.txt').read_bytes(), b'exact mapping')
            with zipfile.ZipFile(root / 'release/native-debug-symbols.zip') as symbols:
                self.assertEqual(symbols.read('arm64-v8a/libtest.so.sym'), b'exact symbols')


if __name__ == '__main__':
    unittest.main()
