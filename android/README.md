# AFTERGLOW 안드로이드 앱 (TWA)

사이트(https://lastsummerdream.github.io/Afterglow/app/)를 전체 화면 앱으로 여는 Trusted Web Activity 프로젝트.
푸시 알림은 사이트의 웹 푸시를 그대로 쓴다(크롬이 전달).

빌드:

```
export ANDROID_HOME=<Android SDK 경로>
export AG_KEYSTORE=<afterglow-release.jks 경로> AG_KEYSTORE_PASSWORD=<비밀번호> AG_KEY_PASSWORD=<비밀번호>
gradle assembleRelease   # → app/build/outputs/apk/release/app-release.apk
```

업데이트할 때는 `app/build.gradle.kts`의 versionCode를 1씩 올리고, 처음과 같은 키스토어로 서명해야 한다.
서명 키(.jks)와 비밀번호는 저장소에 올리지 않는다.

주소창 없애기: `https://lastsummerdream.github.io/.well-known/assetlinks.json` 에 아래 파일이 있어야 한다
(사용자 사이트 저장소 `lastsummerdream.github.io` 필요).

```json
[{ "relation": ["delegate_permission/common.handle_all_urls"],
   "target": { "namespace": "android_app", "package_name": "io.github.lastsummerdream.afterglow",
               "sha256_cert_fingerprints": ["2D:78:7A:F0:01:98:85:F5:EB:73:C8:27:DF:88:46:BE:BB:7D:E4:B2:DD:41:CE:3D:7D:84:B7:13:9A:B2:96:F2"] } }]
```
