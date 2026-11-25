package com.qingka.calorielookup

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null

    private data class PendingExport(
        val requestId: String,
        val jsonContent: String,
        val mode: String
    )
    private var pendingExport: PendingExport? = null

    private val pickImageLauncher = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        val cb = pendingFileCallback
        pendingFileCallback = null
        if (uri != null) {
            cb?.onReceiveValue(arrayOf(uri))
        } else {
            cb?.onReceiveValue(null)
        }
    }

    private val openJsonLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        val cb = pendingFileCallback
        pendingFileCallback = null
        if (uri != null) {
            cb?.onReceiveValue(arrayOf(uri))
        } else {
            cb?.onReceiveValue(null)
        }
    }

    private val createJsonLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val exportReq = pendingExport
        pendingExport = null
        if (exportReq == null) return@registerForActivityResult

        if (uri == null) {
            deliverExportResult(exportReq.requestId, false, exportReq.mode, null, "cancelled")
            return@registerForActivityResult
        }

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val bytes = exportReq.jsonContent.toByteArray(Charsets.UTF_8)
                require(bytes.isNotEmpty()) { "导出内容为空" }
                contentResolver.openOutputStream(uri)?.use { os ->
                    os.write(bytes)
                    os.flush()
                } ?: error("无法打开输出流")
                val displayName = queryDisplayName(uri) ?: "backup.json"
                deliverExportResult(exportReq.requestId, true, exportReq.mode, displayName, null)
            } catch (e: Exception) {
                deliverExportResult(exportReq.requestId, false, exportReq.mode, null, e.message ?: "写入失败")
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
        }

        val nativeFlagsJs = "window.__ANDROID_NATIVE_APP__ = true; window.__ANDROID_NATIVE_OCR__ = true;"
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                webView,
                nativeFlagsJs,
                setOf("https://appassets.androidplatform.net")
            )
        }

        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                view?.evaluateJavascript(nativeFlagsJs, null)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url ?: return false
                if (url.host != "appassets.androidplatform.net" && (url.scheme == "http" || url.scheme == "https")) {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    return true
                }
                return false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = filePathCallback

                val acceptTypes = fileChooserParams?.acceptTypes?.joinToString(",")?.lowercase() ?: ""
                return try {
                    if (acceptTypes.contains("json")) {
                        openJsonLauncher.launch(arrayOf("application/json", "text/plain", "*/*"))
                    } else {
                        pickImageLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    }
                    true
                } catch (_: Exception) {
                    pendingFileCallback?.onReceiveValue(null)
                    pendingFileCallback = null
                    false
                }
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    private fun queryDisplayName(uri: Uri): String? {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) return cursor.getString(idx)
            }
        }
        return null
    }

    private fun deliverOCRResult(requestId: String, lines: List<String>, error: String?) {
        val payload = JSONObject().apply {
            put("requestId", requestId)
            put("lines", JSONArray(lines))
            if (error != null) put("error", error)
        }.toString()

        runOnUiThread {
            webView.evaluateJavascript(
                "window.__onNativeOCRResult && window.__onNativeOCRResult($payload);",
                null
            )
        }
    }

    private fun deliverExportResult(
        requestId: String,
        success: Boolean,
        mode: String,
        displayName: String?,
        error: String?
    ) {
        val payload = JSONObject().apply {
            put("requestId", requestId)
            put("success", success)
            put("mode", mode)
            if (displayName != null) put("displayName", displayName)
            if (error != null) put("error", error)
        }.toString()

        runOnUiThread {
            webView.evaluateJavascript(
                "window.__onNativeExportResult && window.__onNativeExportResult($payload);",
                null
            )
        }
    }

    private suspend fun recognizeChineseText(inputImage: InputImage): List<Text.Line> {
        val recognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        return suspendCancellableCoroutine { cont ->
            recognizer.process(inputImage)
                .addOnSuccessListener { visionText ->
                    val lines = visionText.textBlocks.flatMap { it.lines }
                    cont.resume(lines)
                }
                .addOnFailureListener { e ->
                    cont.cancel(e)
                }
        }
    }

    // 按视觉顺序排序：centerY 从小到大（上->下），同行动态容差内按 left 从小到大（左->右）
    private fun sortLinesVisually(lines: List<Text.Line>): List<String> {
        data class BoxLine(val text: String, val box: Rect)
        val boxed = lines.mapNotNull { line ->
            val rect = line.boundingBox ?: return@mapNotNull null
            val txt = line.text.trim()
            if (txt.isEmpty()) return@mapNotNull null
            BoxLine(txt, rect)
        }.sortedBy { it.box.centerY() }

        val rows = mutableListOf<MutableList<BoxLine>>()
        for (item in boxed) {
            val targetRow = rows.lastOrNull()?.let { row ->
                val anchor = row.first()
                val tol = max(14f, min(anchor.box.height(), item.box.height()) * 0.55f)
                if (abs(item.box.centerY() - anchor.box.centerY()) <= tol) row else null
            }
            if (targetRow != null) {
                targetRow.add(item)
            } else {
                rows.add(mutableListOf(item))
            }
        }

        return rows.flatMap { row ->
            row.sortedBy { it.box.left }.map { it.text }
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun runNativeOCR(requestId: String, base64: String) {
            lifecycleScope.launch(Dispatchers.Default) {
                try {
                    val bytes = Base64.decode(base64, Base64.DEFAULT)
                    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        ?: run {
                            deliverOCRResult(requestId, emptyList(), "无法解码图片")
                            return@launch
                        }
                    val inputImage = InputImage.fromBitmap(bitmap, 0)
                    val rawLines = recognizeChineseText(inputImage)
                    val sorted = sortLinesVisually(rawLines)
                    deliverOCRResult(requestId, sorted, null)
                } catch (e: Exception) {
                    deliverOCRResult(requestId, emptyList(), e.message ?: "离线 OCR 失败")
                }
            }
        }

        @JavascriptInterface
        fun exportJsonFile(requestId: String, fileName: String, jsonContent: String, mode: String) {
            runOnUiThread {
                pendingExport = PendingExport(requestId, jsonContent, mode)
                createJsonLauncher.launch(fileName)
            }
        }
    }
}
