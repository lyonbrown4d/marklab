# Marklab CLI

`marklab` exports local Markdown and combines chapters into publications without
starting the desktop application. It uses the same `marklab-document` rendering
and analysis library as the desktop application. It does not open a workspace
database, scan unrelated workspaces, start a server, or invoke external converters.

```sh
cargo build --release -p marklab-cli
./src-tauri/target/release/marklab --help
marklab export notes.md --format pdf --output notes.pdf
marklab export notes.md --format html --output notes.html
marklab export notes --recursive --format txt --output exported
marklab export notes --recursive --include '**/*.md' --exclude '**/drafts/**' --format html --output exported
cat notes.md | marklab export - --format html --output - > notes.html
marklab publish chapters --format epub --output book.epub --title 'My Book'
marklab publish book.toml --format pdf --output book.pdf
marklab inspect notes.md > analysis.json
cat notes.md | marklab inspect - --ast > ast.json
marklab completions zsh > _marklab
```

## PDF export

PDF is rendered locally by the shared Rust/Typst engine, without Pandoc, TeX, or
a browser. Export one document, convert a directory to individual PDFs, or combine
ordered chapters into one PDF:

```sh
marklab export notes.md --format pdf --output notes.pdf
marklab export notes --recursive --format pdf --output pdf-files --jobs 2
marklab publish chapters --format pdf --output book.pdf --locale zh-CN
```

PDF requires an output file. Spreadsheet embeds are rendered as tables, and
`--include-linked-spreadsheets` also expands local spreadsheet links. System and
embedded fonts provide text rendering and fallback; the output remains static.

## Spreadsheet imports

Embed a local workbook with `![](scores.xlsx)` or `![[scores.xlsx]]`. XLSX,
XLSM, CSV, and TSV imports expand into Markdown tables before rendering, so the
same content appears in PDF, EPUB, HTML, DOCX, TXT, and Markdown exports. Every
worksheet is included within the import limits. Ordinary links such as
`[Scores](scores.xlsx)` remain links unless `--include-linked-spreadsheets` is set:

```sh
marklab export notes.md --format pdf --output notes.pdf --include-linked-spreadsheets
marklab publish chapters --format epub --output book.epub --include-linked-spreadsheets
```

Workbook styles, merged cells, charts, and macros are not reproduced. Formula
cells use saved cached values; missing values are marked with a warning. Save
the workbook in a spreadsheet application to refresh its cached values. Imports
must remain inside the resource root; remote imports are not fetched. Each file
is limited to 16 MiB, with at most 32 references and 64 MiB of imported files per
document. Oversized cell ranges are rejected; long table output is truncated
with a warning.

Supported formats are `html`, `txt`, `epub`, `pdf`, `docx`, and `markdown`.
Single-file export accepts standard input (`-`). Standard output (`--output -`)
supports HTML, TXT, and Markdown. Binary formats and publications require a file.
`inspect` prints document analysis as JSON; `--ast` prints the renderer's Markdown
node tree instead. Analysis includes original content, headings and duplicate
heading slugs, Markdown/wiki links, asset references, word counts, and UTF-16
source positions. It does not resolve links against a workspace database.

`marklab completions SHELL` generates completion scripts for `zsh`, `bash`,
`fish`, `powershell`, and `elvish` on stdout. The scripts include subcommands,
options, format choices, and file/directory completion hints. Regenerate after
upgrading the CLI. For zsh, save the generated function in a directory on `fpath`:

```sh
mkdir -p "$HOME/.local/share/zsh/site-functions"
marklab completions zsh > "$HOME/.local/share/zsh/site-functions/_marklab"
```

Add this `fpath` entry before the existing `compinit` initialization in `.zshrc`.
If completion is not initialized yet, the complete setup is:

```zsh
fpath=("$HOME/.local/share/zsh/site-functions" $fpath)
autoload -Uz compinit
compinit
```

Restart zsh to load the completion function. Bash can load completions for the
current session with `source <(marklab completions bash)`. For fish, save the
script as `~/.config/fish/completions/marklab.fish`. The CLI only prints scripts;
it does not change shell configuration files.

Directory exports preserve relative paths and use a fixed worker pool, defaulting
to the available CPU count capped at four workers. `--jobs N` sets a worker limit from 1 to 64; `--jobs 1` minimizes memory use. Each worker loads and renders one
document at a time, so peak document/image memory scales with the worker count.
All output conflicts are checked before workers start, and the HTML link target
map is shared between workers. Input selection and output paths are independent of worker count; status messages
follow completion order. EPUB identifiers and modification timestamps are generated
for each export. PDF and equation compilation share a serialized Typst engine,
while file loading and other conversion work can proceed in parallel.
Use `--recursive` to include nested directories. `--include` and `--exclude` are
repeatable relative-path globs; excludes take precedence. The output subtree is
excluded from input discovery. Links between selected documents are rewritten
for directory HTML exports. Filesystem symlinks and conventional dependency/build directories (`.git`,
`node_modules`, `.venv`, `venv`, `.tox`, `__pycache__`, `target`, `build`, and
`dist`) are not traversed. A directory supplied explicitly as the input root is
still processed, even when its name is in that list.

Publishing a directory recursively selects Markdown chapters in natural relative
path order (`2.md` precedes `10.md`). A TOML manifest gives explicit chapter order
and optional titles:

```toml
title = "My Book"
locale = "en-US"

[[chapters]]
path = "chapters/introduction.md"
title = "Introduction"

[[chapters]]
path = "chapters/details.md"
title = "Details"
```

Manifest chapter paths are relative to the manifest directory and must remain
inside it. `--title` and `--locale` override manifest values. Supported locales
are `en-US` and `zh-CN`. Publications contain at most 1,000 chapters and use a
cover, table of contents, and chapter page breaks where the format supports them.

Existing outputs require `--overwrite`. Before conversion, the CLI checks source
overwrites, case-insensitive output collisions, and file/directory conflicts.
Writes use a temporary file beside the destination and an atomic commit;
without `--overwrite`, a file created by another process is not replaced.
Directory conversion continues after individual document errors and exits with
a nonzero status if any failed. A partially successful batch keeps its completed
outputs.

Local images resolve relative to their source document. The default allowed
resource root is the input directory, a single file's parent, or the manifest
directory. Use `--resource-root` for a wider explicitly allowed directory; all
source files must also be inside that root. Standard input containing image
references requires `--resource-root`, and its images resolve relative to that
directory. Canonical paths enforce containment, including percent-encoded paths
and symlinks. Remote images are never fetched. Each document loads at most 50
images, each at most 15 MiB; image bytes are limited to 100 MiB and Markdown text
to 64 MiB per conversion/publication. Missing or oversized images are omitted.

Animated spinners and batch progress bars appear only on terminal stderr.
Redirected stderr receives plain status messages. `--no-progress` disables
animation; `--quiet` suppresses successful-operation messages. Errors remain
visible, and stdout contains only document content or JSON. Ctrl-C requests
cancellation and prevents the pending output commit; completed batch files stay
available. Rendering cancellation is cooperative, so a current native rendering
operation may finish before the process exits.

```sh
cargo test -p marklab-cli
```
