import SwiftUI
import WebKit
import Vision
import UIKit

struct LocalWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        let nativeFlagScript = WKUserScript(
            source: "window.__IOS_NATIVE_APP__ = true; window.__IOS_NATIVE_OCR__ = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        contentController.addUserScript(nativeFlagScript)
        contentController.add(context.coordinator, name: "nativeOCR")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        context.coordinator.webView = webView
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false

        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") {
            let webDir = indexURL.deletingLastPathComponent()
            webView.loadFileURL(indexURL, allowingReadAccessTo: webDir)
        } else {
            let fallbackHTML = """
            <html><body style="font-family:-apple-system;padding:60px 24px;text-align:center;">
            <h2>未找到内置网页资源</h2>
            <p>请确认 web 目录已打包进 App Bundle。</p>
            </body></html>
            """
            webView.loadHTMLString(fallbackHTML, baseURL: nil)
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if let url = navigationAction.request.url,
               url.scheme == "http" || url.scheme == "https" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "nativeOCR",
                  let body = message.body as? [String: Any],
                  let requestId = body["requestId"] as? String,
                  let base64 = body["base64"] as? String else {
                return
            }

            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                guard let imageData = Data(base64Encoded: base64),
                      let uiImage = UIImage(data: imageData),
                      let cgImage = uiImage.cgImage else {
                    self?.deliverOCRResult(requestId: requestId, lines: [], error: "无法解码图片")
                    return
                }

                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.recognitionLanguages = ["zh-Hans", "en-US"]
                request.usesLanguageCorrection = true

                let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                do {
                    try handler.perform([request])
                    let observations = request.results ?? []
                    // 按视觉顺序从上到下、从左到右排序
                    let sorted = observations.sorted { a, b in
                        let dy = abs(a.boundingBox.midY - b.boundingBox.midY)
                        if dy > 0.018 {
                            return a.boundingBox.midY > b.boundingBox.midY
                        }
                        return a.boundingBox.minX < b.boundingBox.minX
                    }
                    let lines = sorted.compactMap { $0.topCandidates(1).first?.string }
                    self?.deliverOCRResult(requestId: requestId, lines: lines, error: nil)
                } catch {
                    self?.deliverOCRResult(requestId: requestId, lines: [], error: error.localizedDescription)
                }
            }
        }

        private func deliverOCRResult(requestId: String, lines: [String], error: String?) {
            var payload: [String: Any] = [
                "requestId": requestId,
                "lines": lines
            ]
            if let error = error {
                payload["error"] = error
            }
            guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
                  let jsonStr = String(data: jsonData, encoding: .utf8) else {
                return
            }
            DispatchQueue.main.async { [weak self] in
                self?.webView?.evaluateJavaScript("window.__onNativeOCRResult && window.__onNativeOCRResult(\(jsonStr));", completionHandler: nil)
            }
        }
    }
}
