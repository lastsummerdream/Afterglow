plugins { id("com.android.application") }
val ksPath = System.getenv("AG_KEYSTORE") ?: ""
android {
    namespace = "io.github.lastsummerdream.afterglow"
    compileSdk = 35
    defaultConfig {
        applicationId = "io.github.lastsummerdream.afterglow"
        minSdk = 21
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
    signingConfigs {
        create("release") {
            if (ksPath.isNotEmpty()) {
                storeFile = file(ksPath)
                storePassword = System.getenv("AG_KEYSTORE_PASSWORD")
                keyAlias = "afterglow"
                keyPassword = System.getenv("AG_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies { implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0") }
