from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
android = root / "android"
template = root / "android-template" / "app" / "src" / "main" / "java" / "com" / "jurnalnutritie" / "app"
target = android / "app" / "src" / "main" / "java" / "com" / "jurnalnutritie" / "app"
target.mkdir(parents=True, exist_ok=True)

generated_java = target / "MainActivity.java"
if generated_java.exists():
    generated_java.unlink()

for name in ("MainActivity.kt", "HealthConnectPlugin.kt"):
    shutil.copy2(template / name, target / name)

root_build_file = android / "build.gradle"
root_build = root_build_file.read_text()
if "kotlin-gradle-plugin" not in root_build:
    root_build = root_build.replace(
        "classpath 'com.android.tools.build:gradle:",
        "classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.20'\n"
        "        classpath 'com.android.tools.build:gradle:",
        1,
    )
    root_build_file.write_text(root_build)

build_file = android / "app" / "build.gradle"
build_text = build_file.read_text()
if "org.jetbrains.kotlin.android" not in build_text:
    build_text = "apply plugin: 'org.jetbrains.kotlin.android'\n" + build_text
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

# Android 14+ requires a permission-usage activity before Health Connect
# will present health-data permissions to the user.
manifest = manifest_file.read_text()
if "ViewPermissionUsageActivity" not in manifest:
    permission_usage_alias = """
        <activity-alias
            android:name="ViewPermissionUsageActivity"
            android:exported="true"
            android:targetActivity=".MainActivity"
            android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
            <intent-filter>
                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
            </intent-filter>
        </activity-alias>
"""
    manifest = manifest.replace("</application>", permission_usage_alias + "    </application>", 1)
    manifest_file.write_text(manifest)
