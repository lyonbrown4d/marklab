# Workspace Map Design QA

## Evidence

- Design source: `C:\Users\12783\.codex\generated_images\01a0ec98-36a6-7d52-8af7-b9ea0d998f93\exec-ff257ddf-fe43-4eaf-8758-819a8e21d029.png`
- Implementation screenshot: `F:\Projects\marklab\output\playwright\product-audit\real-workspace-map.png`
- Design pixels: 1536 × 1024
- Implementation pixels: 1440 × 960
- CSS viewport: 1440 × 960
- Application state: Windows Electron build, light theme, `D:\Projects\third-party-integration.wiki`, workspace map overview mode, Home document editing directly on the canvas, external resources hidden after toggle verification.

## Comparison

### Full view

- The implementation preserves the existing Marklab titlebar, bottom status bar, canvas controls, and compact toolbar rather than introducing a separate dashboard shell.
- Overview/focus switching, automatic arrangement, search, and the external-resource count occupy the same compact top-left control area as the approved design.
- AST-derived communities render as low-contrast colored canvas regions with stable labels and counts.
- Compact Markdown cards use the approved title, path, and excerpt hierarchy. The active Markdown card expands into the native Plate editor without opening a side panel.
- The real Wiki contains substantially more nodes and links than the illustrative design. ELK compound group packing prevents card overlap; high-degree links remain visible as low-emphasis context and only twelve incident links are emphasized at once.

### Focused regions

- Active editor: filename strip remains the drag handle, the document body is directly editable, and four-edge/four-corner resize plus relationship/pin/more actions remain available without covering document content.
- Group regions: padding, rounded corners, tint strength, labels, and counts remain legible behind cards in both light and dark theme tokens.
- Navigation: minimap, zoom, fit-view, search-to-node, node dragging, and responsive 720 × 640 overflow checks passed in the Electron black-box test.

## Iteration history

1. Initial stress-layout capture failed visual QA because large real-world communities overlapped and high-degree links formed a dark bundle.
2. Replaced overview stress placement with ELK compound group packing and recursive worker-position flattening.
3. Reduced overview edge prominence and capped emphasized hub edges while retaining all relationships in the graph.
4. Re-ran the complete real-workspace flow; no node overlap, layout exception, horizontal overflow, or runtime error remained.
5. Replaced the edge-less overview root layout with wide ELK box packing. Six-group geometry now produces at least three columns, a landscape bounding box, and no card overlap while focus mode retains relationship-oriented layered layout.

## Residual differences

- Community names and sizes are data-derived (`frontmatter` → Markdown headings/tokens → internal-link communities → path fallback), so the real Wiki shows groups such as `Libs` rather than the illustrative `Documentation`, `Operations`, and `Libraries` labels.
- The approved mockup shows a deliberately small graph. The implementation keeps the same interaction and visual hierarchy while fitting the larger production dataset at the configured readable minimum zoom.

final result: passed
