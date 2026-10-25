# Marklab document library

Host-independent Rust document processing used directly by Marklab desktop and
the standalone CLI. It does not depend on Tauri, a window, IPC, a database, or a
running application.

Public APIs:

- `markdown::parse(&str)` returns owned `Node` / `Kind` trees. Both support Serde.
- `markdown::plain` and `markdown::footnotes` extract inline text and footnotes.
- `analysis::parse(path, content)` returns document headings, links, assets, title,
  word count, and UTF-16 line/column positions. Markdown and wiki links are
  recognized; workspace target resolution remains the caller's responsibility.
- `analysis::slug` provides the heading normalization used by HTML and EPUB.
- `assets::image_urls`, `assets::load`, and `assets::load_from_parent` collect
  bounded local images within an explicit canonical resource root.
- `render` converts ordered `SourceDocument` values to Markdown, TXT, HTML, EPUB,
  PDF, or DOCX using `PublicationOptions` and a cancellation token.

```rust
use marklab_document::{analysis, markdown};

let source = "# Introduction\n\n[Details](details.md)";
let ast = markdown::parse(source)?;
let document = analysis::parse("intro.md".into(), source.into())?;
assert_eq!(document.headings[0].slug, "introduction");
assert_eq!(document.links[0].target, "details.md");
# Ok::<(), marklab_document::error::BackendError>(())
```

The renderer AST is a semantic representation for output, rather than a lossless
Markdown editor syntax tree. It supports tables, footnotes, strikethrough, task
lists, and math. Raw HTML is omitted except line breaks; original source and
link destination offsets are available through document analysis. Wiki links are
analyzed, but their renderer representation remains text.

Rendering performs no output-file writes. Hosts own save authorization, atomic
output commits, task queues, progress presentation, and cancellation requests.
Asset loading performs explicit local filesystem reads and never downloads URLs.
Text/image/chapter limits must also be enforced by the host before collecting
large input sets. Current CLI and desktop do so before rendering.

EPUB writes navigation, package metadata, ordered XHTML chapters, and static PNG
resources. Math uses the shared Typst renderer. Missing images fall back to their
text labels. HTML uses embedded PNGs. PDF, DOCX, and equation rendering share a
serialized Typst engine to keep transient resource resolution isolated across
concurrent jobs.

Enable the optional `specta` feature only when generating desktop IPC types.
AST and analysis consumers use the same crate as format exporters; this first
version also includes the native rendering dependencies.

```sh
cargo test -p marklab-document --locked
```
