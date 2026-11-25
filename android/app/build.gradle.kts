plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val coreWebFiles = listOf(
    "index.html",
    "styles.css",
    "china_food_db.js",
    "data.js",
    "recipe_parser.js",
    "app.js",
    "icon.svg"
)

val syncWebAssets by tasks.registering(Sync::class) {
    val repoRoot = rootProject.projectDir.parentFile
    from(repoRoot) {
        include(coreWebFiles)
    }
    into(layout.projectDirectory.dir("src/main/assets/web"))
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}

android {
    namespace = "com.qingka.calorielookup"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.qingka.calorielookup"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.8.1"

        ndk {
            abiFilters += "arm64-v8a"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.google.mlkit:text-recognition-chinese:16.0.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
