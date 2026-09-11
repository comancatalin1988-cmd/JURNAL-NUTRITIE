from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
android = root / "android"
template = root / "android-template" / "app" / "src" / "main" / "java" / "com" / "jurnalnutritie" / "app"
target = android / "app" / "src" / "main" / "java" / "com" / "jurnalnutritie" / "app"
target.mkdir(parents=True, exist_ok=True)

for name in ("MainActivity.kt", "HealthConnectPlugin.kt"):
    shutil.copy2(template / name, target / name)

build_file = android / "app" / "build.gradle"
build_text = build_file.read_text()
build_text = build_text.replace(
    "minSdkVersion rootProject.ext.minSdkVersion",
    "minSdkVersion 26",
    1,
)
marker = "dependencies {"
dependencies = (
    'dependencies {\n'
    '    implementation "androidx.health.connect:connect-client:1.1.0"\n'
    '    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2"'
)
if "androidx.health.connect:connect-client" not in build_text:
    build_text = build_text.replace(marker, dependencies, 1)
    build_file.write_text(build_text)

manifest_file = android / "app" / "src" / "main" / "AndroidManifest.xml"
manifest = manifest_file.read_text()
if "android.permission.health.READ_STEPS" not in manifest:
    manifest = manifest.replace(
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n\n'
        '    <uses-permission android:name="android.permission.health.READ_STEPS" />\n\n'
        '    <queries>\n'
        '        <package android:name="com.google.android.apps.healthdata" />\n'
        '    </queries>',
        1,
    )
    manifest_file.write_text(manifest)
