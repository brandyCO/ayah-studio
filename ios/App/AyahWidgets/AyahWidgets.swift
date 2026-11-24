import WidgetKit
import SwiftUI

// Home-screen widgets "Today's ayah" and "My ayah" (owner request 2026-11-24), the iPhone counterparts of
// DailyAyahWidget.java / MyAyahWidget.java. The app (DailyPlugin.swift) leaves in the App Group, by local date: today's
// ayah (the same for everyone) and My ayah (picked from what the user memorises and reads), in the chosen translation,
// the Arabic as pictures drawn by the app in its Quran font (never a system font), labels in the app's language and the
// theme's colours. Small and medium show the ayah the widget was added for; large shows both, today's above mine.
// One entry a day at local midnight, for as many days as the app handed over. Tap → the ayah in the app.

private let group = "group.com.brandyco.ayahstudio"

struct Ayah {
    var key = ""
    var ref = ""
    var text = ""
    var note = ""      // the translator, or why the ayah is mine
    var hash = "#/"
    var label = ""
    var mine = false
}

struct Store {
    var today: [String: [String: String]] = [:]
    var mine: [String: [String: String]] = [:]
    var labels: [String: String] = [:]
    var theme: [String: String] = [:]
    var arabic = false

    static func load() -> Store {
        var s = Store()
        guard let data = UserDefaults(suiteName: group)?.data(forKey: "ayahWidget"),
              let doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return s }
        s.today = doc["today"] as? [String: [String: String]] ?? [:]
        s.mine = doc["mine"] as? [String: [String: String]] ?? [:]
        s.labels = doc["labels"] as? [String: String] ?? [:]
        s.theme = doc["theme"] as? [String: String] ?? [:]
        s.arabic = (doc["lang"] as? String) == "ar"
        return s
    }

    static func dayKey(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 2026, c.month ?? 1, c.day ?? 1)
    }

    /// The entry for this day, else the newest one before it (the app has not been opened for a while).
    private static func on(_ map: [String: [String: String]], _ day: String) -> [String: String]? {
        if let x = map[day] { return x }
        guard let best = map.keys.filter({ $0 <= day }).max() ?? map.keys.min() else { return nil }
        return map[best]
    }

    func ayah(mine wantMine: Bool, on date: Date) -> Ayah? {
        let day = Store.dayKey(date)
        let x = wantMine ? (Store.on(mine, day) ?? Store.on(today, day)) : Store.on(today, day)
        guard let x else { return nil }
        let isMine = wantMine && Store.on(mine, day) != nil
        return Ayah(key: x["key"] ?? "", ref: x["ref"] ?? "", text: x["text"] ?? "",
                    note: (isMine ? x["why"] : x["credit"]) ?? "", hash: x["hash"] ?? "#/",
                    label: labels[isMine ? "mine" : "today"] ?? "", mine: isMine)
    }

    func days() -> [String] { Array(Set(today.keys).union(mine.keys)).sorted() }
}

struct AyahEntry: TimelineEntry {
    let date: Date
    let today: Ayah?
    let mine: Ayah?
    let store: Store
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> AyahEntry {
        AyahEntry(date: Date(), today: Ayah(ref: "Ash-Sharh · 94:5–6", text: "For indeed, with hardship [will be] ease."), mine: nil, store: Store())
    }

    func getSnapshot(in context: Context, completion: @escaping (AyahEntry) -> Void) {
        let s = Store.load()
        let e = AyahEntry(date: Date(), today: s.ayah(mine: false, on: Date()), mine: s.ayah(mine: true, on: Date()), store: s)
        completion(e.today == nil ? placeholder(in: context) : e)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AyahEntry>) -> Void) {
        let s = Store.load()
        let cal = Calendar.current
        var entries = [AyahEntry(date: Date(), today: s.ayah(mine: false, on: Date()), mine: s.ayah(mine: true, on: Date()), store: s)]
        // One entry at each coming midnight, for the days the app left (up to three weeks).
        var day = cal.startOfDay(for: Date())
        for _ in 0..<21 {
            guard let next = cal.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
            entries.append(AyahEntry(date: day, today: s.ayah(mine: false, on: day), mine: s.ayah(mine: true, on: day), store: s))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

extension Color {
    init(hex: String?, _ fallback: UInt32) {
        var v = fallback
        if let h = hex?.trimmingCharacters(in: CharacterSet(charactersIn: "#")), h.count == 6, let n = UInt32(h, radix: 16) { v = n }
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}

/// The night card in the theme's colours, as on the Android widgets (WidgetArt): a deep night with a soft glow.
struct Night: View {
    let theme: [String: String]
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: theme["night"], 0x0f3328), Color(hex: theme["night2"], 0x0b1a15), Color(hex: theme["night3"], 0x070e0c)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [Color(hex: theme["n1"], 0x22b3a0).opacity(0.28), .clear], center: .topTrailing, startRadius: 0, endRadius: 220)
        }
    }
}

func picture(_ key: String) -> UIImage? {
    guard !key.isEmpty, let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    return UIImage(contentsOfFile: dir.appendingPathComponent("daily/" + key.replacingOccurrences(of: ":", with: "_") + ".png").path)
}

/// One ayah: its label, the reference in a chip, the Arabic picture or the translation, and the note under it.
struct AyahPanel: View {
    let ayah: Ayah
    let arabic: Bool
    let showLabel: Bool
    let compact: Bool
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 4 : 6) {
            if showLabel && !ayah.label.isEmpty {
                Text(ayah.label).font(.system(size: 12, weight: .heavy, design: .rounded)).foregroundColor(.white.opacity(0.8))
            }
            Text(ayah.ref)
                .font(.system(size: 11, weight: .bold, design: .rounded)).foregroundColor(.white).lineLimit(1)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(accent.opacity(0.35)))
            if arabic, let img = picture(ayah.key) {
                Image(uiImage: img).renderingMode(.template).resizable().scaledToFit()
                    .foregroundColor(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Text(ayah.text)
                    .font(.system(size: compact ? 14 : 16, weight: .medium, design: .serif))
                    .foregroundColor(.white.opacity(0.95)).minimumScaleFactor(0.55)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            if !ayah.note.isEmpty && (ayah.mine || !(arabic && picture(ayah.key) != nil)) {
                Text(ayah.note).font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.55)).lineLimit(2)
            }
        }
    }
}

struct AyahWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: AyahEntry
    let mine: Bool

    private func url(_ a: Ayah) -> URL { URL(string: "ayahstudio://open" + a.hash) ?? URL(string: "ayahstudio://open#/")! }

    var body: some View {
        let accent = Color(hex: entry.store.theme["n1"], 0x22b3a0)
        Group {
            if family == .systemLarge, let t = entry.today, let m = entry.mine, m.mine {
                VStack(spacing: 10) {
                    Link(destination: url(t)) {
                        AyahPanel(ayah: t, arabic: entry.store.arabic, showLabel: true, compact: false, accent: accent)
                    }
                    Rectangle().fill(Color.white.opacity(0.15)).frame(height: 1)
                    Link(destination: url(m)) {
                        AyahPanel(ayah: m, arabic: entry.store.arabic, showLabel: true, compact: false, accent: accent)
                    }
                }
            } else if let a = mine ? (entry.mine ?? entry.today) : entry.today {
                AyahPanel(ayah: a, arabic: entry.store.arabic, showLabel: a.mine || family != .systemSmall, compact: family == .systemSmall, accent: accent)
                    .widgetURL(url(a))
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Ayah Studio").font(.system(size: 15, weight: .heavy, design: .rounded)).foregroundColor(.white)
                    Text(NSLocalizedString("empty", comment: "")).font(.system(size: 12)).foregroundColor(.white.opacity(0.7))
                }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .widgetPadding(family == .systemSmall ? 12 : 14)
        .widgetBackground(Night(theme: entry.store.theme))
    }
}

extension View {
    /// iOS 17 adds its own margins round a widget's content; iOS 16 needs ours.
    @ViewBuilder func widgetPadding(_ p: CGFloat) -> some View {
        if #available(iOSApplicationExtension 17.0, *) { self } else { self.padding(p) }
    }

    /// iOS 17 wants the background through containerBackground; iOS 16 draws it behind.
    @ViewBuilder func widgetBackground<B: View>(_ b: B) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(for: .widget) { b }
        } else {
            self.background(b)
        }
    }
}

struct TodayAyahWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayAyah", provider: Provider()) { AyahWidgetView(entry: $0, mine: false) }
            .configurationDisplayName(NSLocalizedString("today.name", comment: ""))
            .description(NSLocalizedString("today.desc", comment: ""))
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct MyAyahWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MyAyah", provider: Provider()) { AyahWidgetView(entry: $0, mine: true) }
            .configurationDisplayName(NSLocalizedString("mine.name", comment: ""))
            .description(NSLocalizedString("mine.desc", comment: ""))
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct AyahWidgets: WidgetBundle {
    var body: some Widget {
        TodayAyahWidget()
        MyAyahWidget()
    }
}
