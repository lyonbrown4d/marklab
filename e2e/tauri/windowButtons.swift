// Read-only AppKit accessibility probe; never linked into the application.
import AppKit
import ApplicationServices

func attribute(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
  var result: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, key as CFString, &result) == .success else { return nil }
  return result
}
func bounds(_ element: AXUIElement) -> [String: Double]? {
  guard let position = attribute(element, kAXPositionAttribute),
        CFGetTypeID(position) == AXValueGetTypeID(),
        let dimensions = attribute(element, kAXSizeAttribute),
        CFGetTypeID(dimensions) == AXValueGetTypeID() else { return nil }
  var point = CGPoint.zero
  var size = CGSize.zero
  guard AXValueGetValue(position as! AXValue, .cgPoint, &point),
        AXValueGetValue(dimensions as! AXValue, .cgSize, &size) else { return nil }
  return ["x": point.x, "y": point.y, "width": size.width, "height": size.height]
}
guard CommandLine.arguments.count == 2,
      let pid = Int32(CommandLine.arguments[1]) else { fatalError("Expected owned test process ID") }
let application = AXUIElementCreateApplication(pid)
let windows = attribute(application, kAXWindowsAttribute) as? [AXUIElement] ?? []
var records: [[String: Any]] = []
for window in windows {
  var record: [String: Any] = ["window": bounds(window) ?? [:]]
  for (name, key) in [("close", kAXCloseButtonAttribute), ("minimize", kAXMinimizeButtonAttribute), ("zoom", kAXZoomButtonAttribute)] {
    if let value = attribute(window, key), CFGetTypeID(value) == AXUIElementGetTypeID() {
      record[name] = bounds(value as! AXUIElement) ?? [:]
    }
  }
  if record["close"] != nil { records.append(record) }
}
let data = try JSONSerialization.data(withJSONObject: records, options: [.sortedKeys])
print(String(decoding: data, as: UTF8.self))
