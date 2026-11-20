import SwiftUI

@main
struct QingKaLookupApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            (colorScheme == .dark ? Color.black : Color(red: 242/255, green: 242/255, blue: 247/255))
                .ignoresSafeArea()

            LocalWebView()
                .ignoresSafeArea()
        }
    }
}
