import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.jetbrains.kotlin.jvm") version "2.3.20"
    id("org.jetbrains.intellij.platform") version "2.20.1"
}

group = "asia.damun"
version = providers.gradleProperty("pluginVersion").get()

// 저장소 경로에 한글 같은 비 ASCII 글자가 있으면 Windows 에서 시험(test)이 클래스를 찾지 못한다:
// Gradle 은 시험 JVM 에 classpath 를 파일로 넘기는데, JVM 이 그 파일을 시스템 코드 페이지로 읽는다.
// 그럴 때는 -PoutDir=C:/ascii/path 로 빌드 폴더와 시험용 IDE 폴더를 ASCII 경로로 옮긴다. (buildPlugin 은 옮기지 않아도 된다.)
val outDir = providers.gradleProperty("outDir").orNull
if (outDir != null) layout.buildDirectory = file(outDir)

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

// 이미 설치된 JetBrains IDE(IntelliJ IDEA · WebStorm · Android Studio …)가 있으면 -PlocalIde=폴더 로 그것을 쓴다.
// 없으면 IntelliJ IDEA 를 내려받는다 (1 GB 가 넘는다).
val localIde = providers.gradleProperty("localIde").orNull

dependencies {
    intellijPlatform {
        if (localIde != null) local(localIde) else intellijIdea(providers.gradleProperty("platformVersion").get())
        testFramework(TestFrameworkType.Platform)
    }
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.opentest4j:opentest4j:1.3.0")
}

// Gradle 을 돌리는 JDK(21 이상)를 그대로 쓰고, 결과물은 IDE 가 요구하는 Java 21 용으로 만든다.
// (JDK 21 을 따로 찾거나 내려받지 않게 하려는 것이다.)
java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(JavaVersion.current().majorVersion)
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.release = 21
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_21)
        freeCompilerArgs.add("-Xjdk-release=21")
    }
}

intellijPlatform {
    // 설정 화면이 없으므로 검색 색인을 만들 필요가 없다. 폼 · @NotNull 계측도 쓰지 않는다.
    buildSearchableOptions = false
    instrumentCode = false
    if (outDir != null) sandboxContainer = layout.buildDirectory.dir("idea-sandbox")

    pluginConfiguration {
        ideaVersion {
            // 빌드하고 시험한 판(2026.1)부터. 더 옛 판은 확인하지 못했다.
            sinceBuild = "261"
            untilBuild = provider { null }
        }
    }
}

// 분석 엔진(TypeScript)을 Node 용 한 파일로 묶는다. Node 22.18 이상과 ../vscode 의 esbuild 가 필요하다.
val engineDir = layout.buildDirectory.dir("engine")
val bundleEngine by tasks.registering(Exec::class) {
    group = "build"
    description = "Bundles the VerifyLens engine into a single Node script"
    inputs.files("build-engine.mjs")
    inputs.dir("engine")
    inputs.dir("../src")
    inputs.dir("../samples")
    inputs.files("../vscode/src/model.ts")
    outputs.dir(engineDir)
    commandLine(providers.gradleProperty("node").getOrElse("node"), "build-engine.mjs", engineDir.get().asFile.absolutePath)
}

// 엔진과 샘플은 jar 안이 아니라 플러그인 폴더의 engine/ 에 파일로 둔다 (Node 가 직접 읽어야 하므로).
tasks.withType<PrepareSandboxTask>().configureEach {
    from(bundleEngine) {
        into(pluginName.map { "$it/engine" })
    }
}

// 실제 창으로 띄워 볼 때: gradlew runIde --args="<프로젝트 폴더>" [-PautoRun=check|demo] [-PideJvmArgs="-Da=b -Dc=d"]
// autoRun 은 프로젝트가 열린 뒤 그 동작을 한 번 실행한다 (AutoRun.kt). 이 IDE 는 따로 둔 시험용 설정 폴더를 쓴다.
tasks.runIde {
    providers.gradleProperty("autoRun").orNull?.let { jvmArgs("-Dverifylens.autorun=$it") }
    providers.gradleProperty("ideJvmArgs").orNull?.let { jvmArgs(it.split(" ").filter(String::isNotBlank)) }
}

tasks.test {
    dependsOn(bundleEngine)
    systemProperty("verifylens.engine.dir", engineDir.get().asFile.absolutePath)
    // 연습 저장소로 확인하려면: -PpracticeRepo=<폴더>. 시험은 그 폴더의 사본을 열고 원본은 건드리지 않는다.
    providers.gradleProperty("practiceRepo").orNull?.let { systemProperty("verifylens.practiceRepo", it) }
    systemProperty("verifylens.shots", layout.buildDirectory.dir("shots").get().asFile.absolutePath)
    systemProperty("file.encoding", "UTF-8")
    // 시험이 남기는 줄("[VerifyLens 시험] …")은 build/test-results/test/*.xml 에 들어 있다.
    testLogging {
        events("passed", "failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
