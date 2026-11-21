# Interactive local credential entry. Passwords never appear in command arguments or logs.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$keystorePath = 'C:/Alex/claves/ryyco,jks'
$javaHome = Join-Path $env:USERPROFILE '.jdks/jbr-21.0.11'
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Firma de RYYCO - entrada local protegida'
$form.Size = New-Object System.Drawing.Size(530, 330)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$notice = New-Object System.Windows.Forms.Label
$notice.Text = "Archivo: $keystorePath`nSe verificará la firma anterior. Las contraseñas se guardarán solo en android/keystore.properties, excluido de Git."
$notice.SetBounds(18, 15, 480, 65)
$form.Controls.Add($notice)
$boxes = @()
$labels = @('Contraseña del almacén:', 'Contraseña de la clave (vacía = la misma):')
for ($i = 0; $i -lt 2; $i++) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $labels[$i]
    $label.SetBounds(18, (85 + $i * 60), 480, 22)
    $box = New-Object System.Windows.Forms.TextBox
    $box.UseSystemPasswordChar = $true
    $box.SetBounds(18, (107 + $i * 60), 475, 25)
    $form.Controls.Add($label)
    $form.Controls.Add($box)
    $boxes += $box
}
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Verificar y guardar'
$button.SetBounds(310, 235, 180, 35)
$button.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $button
$form.Controls.Add($button)
if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { $form.Dispose(); exit 1 }
$storeSecret = $boxes[0].Text
$keySecret = $boxes[1].Text
$form.Dispose()
if (!$storeSecret) { throw 'No se ingresó una contraseña.' }
if (!$keySecret) { $keySecret = $storeSecret }
$privateDir = Join-Path $root 'build/signing-private'
[IO.Directory]::CreateDirectory($privateDir) | Out-Null
$secretFile = Join-Path $privateDir ([guid]::NewGuid().ToString() + '.txt')
try {
    [IO.File]::WriteAllText($secretFile, $storeSecret, (New-Object Text.UTF8Encoding($false)))
    $listing = & (Join-Path $javaHome 'bin/keytool.exe') '-J-Duser.language=en' '-J-Duser.country=US' -list -v -keystore $keystorePath '-storepass:file' $secretFile 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo desbloquear el almacén. Comprueba la contraseña.' }
    $expected = '45:96:30:1C:EB:3B:4B:48:8C:9B:7B:3C:54:A0:6A:83:9C:56:3C:96:5A:09:33:EC:A8:5A:CE:19:ED:A0:FD:5D'
    if (!$listing.Contains($expected)) { throw 'El certificado no coincide con el AAB anterior. No se guardó la configuración.' }
    $aliases = [regex]::Matches($listing, '(?m)^Alias name: (.+)\r?$')
    if ($aliases.Count -ne 1) { throw 'El almacén tiene varias claves; selecciona la correcta desde Android Studio.' }
    $alias = $aliases[0].Groups[1].Value.Trim()
    function Escape-Property([string] $value) {
        $out = New-Object Text.StringBuilder
        foreach ($c in $value.ToCharArray()) {
            if ([int]$c -lt 33 -or [int]$c -gt 126 -or $c -eq '\' -or $c -eq '=' -or $c -eq ':') {
                [void]$out.Append(('\u{0:x4}' -f [int]$c))
            } else { [void]$out.Append($c) }
        }
        return $out.ToString()
    }
    $content = "storeFile=$(Escape-Property $keystorePath)`nstorePassword=$(Escape-Property $storeSecret)`nkeyAlias=$(Escape-Property $alias)`nkeyPassword=$(Escape-Property $keySecret)`n"
    $target = Join-Path $root 'android/keystore.properties'
    if (Test-Path -LiteralPath $target) { throw 'Ya existe keystore.properties. Se conservó sin sustituirlo.' }
    [IO.File]::WriteAllText($target, $content, (New-Object Text.UTF8Encoding($false)))
    [System.Windows.Forms.MessageBox]::Show('Certificado verificado y firma configurada. Puedes volver a Codex.', 'RYYCO') | Out-Null
} catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'No se configuró la firma') | Out-Null
    exit 1
} finally {
    if (Test-Path -LiteralPath $secretFile) { Remove-Item -LiteralPath $secretFile }
    $storeSecret = $null; $keySecret = $null; $content = $null; $listing = $null
}
