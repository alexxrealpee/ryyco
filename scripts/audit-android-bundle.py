"""Archive one exact AAB and its embedded diagnostics without replacing releases.

Usage: python scripts/audit-android-bundle.py input.aab new-output-directory
Signature and manifest validation must also be performed with jarsigner/bundletool.
No fabricated mapping or symbols are produced when the AAB does not contain them.
"""
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
import zipfile


def elf_sections(data):
    if data[:4] != b'\x7fELF':
        raise ValueError('Native library is not an ELF file')
    endian = '<' if data[5] == 1 else '>'
    if data[4] == 2:
        offset = struct.unpack_from(endian + 'Q', data, 40)[0]
        size, count, names_index = struct.unpack_from(endian + 'HHH', data, 58)
        fmt = endian + 'IIQQQQIIQQ'
    else:
        offset = struct.unpack_from(endian + 'I', data, 32)[0]
        size, count, names_index = struct.unpack_from(endian + 'HHH', data, 46)
        fmt = endian + 'IIIIIIIIII'
    sections = [struct.unpack_from(fmt, data, offset + i * size) for i in range(count)]
    names_section = sections[names_index]
    names = data[names_section[4]:names_section[4] + names_section[5]]
    return [names[s[0]:].split(b'\0')[0].decode('ascii') for s in sections]


def archive_bundle(source, destination):
    source = Path(source).resolve()
    destination = Path(destination).resolve()
    if destination.exists():
        raise FileExistsError('Use a new directory; existing release files are never replaced.')
    with zipfile.ZipFile(source) as bundle:
        if bundle.testzip() is not None:
            raise ValueError('AAB ZIP integrity check failed')
        names = bundle.namelist()
        if 'base/manifest/AndroidManifest.xml' not in names or 'BundleConfig.pb' not in names:
            raise ValueError('Not an Android App Bundle')
        libraries = []
        for name in names:
            if name.endswith('.so'):
                data = bundle.read(name)
                sections = elf_sections(data)
                libraries.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest(),
                                  'symbol_table': '.symtab' in sections,
                                  'debug_info': '.debug_info' in sections})
        mapping_name = 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map'
        symbol_prefix = 'BUNDLE-METADATA/com.android.tools.build.debugsymbols/'
        symbols = [name for name in names if name.startswith(symbol_prefix) and not name.endswith('/')]
        destination.mkdir(parents=True)
        target = destination / 'ryyco-release.aab'
        shutil.copy2(source, target)
        artifacts = [target]
        if mapping_name in names:
            mapping = destination / 'mapping.txt'
            mapping.write_bytes(bundle.read(mapping_name))
            artifacts.append(mapping)
        if symbols:
            symbols_zip = destination / 'native-debug-symbols.zip'
            with zipfile.ZipFile(symbols_zip, 'w', zipfile.ZIP_DEFLATED) as output:
                for name in symbols:
                    relative = name[len(symbol_prefix):]
                    if '..' in Path(relative).parts or relative.startswith('/'):
                        raise ValueError('Unexpected native symbol path')
                    output.writestr(relative, bundle.read(name))
            artifacts.append(symbols_zip)
        report = {'source': str(source), 'aab': str(target), 'libraries': libraries,
                  'mapping_embedded': mapping_name in names, 'native_symbols_embedded': symbols,
                  'signature_entries_present': any(n.startswith('META-INF/') and n.endswith(('.RSA', '.EC', '.DSA')) for n in names),
                  'signature_verification': 'Run jarsigner -verify and compare upload certificate separately.',
                  'sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in artifacts}}
        (destination / 'artifact-audit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        return report


if __name__ == '__main__':
    print(json.dumps(archive_bundle(sys.argv[1], sys.argv[2]), indent=2))
