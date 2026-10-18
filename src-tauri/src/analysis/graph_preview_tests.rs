use super::*;

#[test]
fn renders_bounded_markdown_structure_and_math_without_active_resources() {
    let preview = render(
        "# Title\n\n**Strong** <kbd>Ctrl</kbd><br> $x^2$\n\n$$y = 2$$\n\n- One\n- Two\n\n[Remote](https://example.com) ![Diagram](remote.png)\n\n[^1]: Source\n\nNote[^1]",
    );
    for fragment in [
        "<h1>Title</h1>",
        "<strong>Strong</strong>",
        "<kbd>Ctrl</kbd>",
        "<br>",
        "<ul>",
        "graph-preview-link",
        "Diagram",
        "role=\"doc-footnote\"",
        "aria-label=\"[^1]\"",
    ] {
        assert!(
            preview.html.contains(fragment),
            "missing {fragment}: {}",
            preview.html
        );
    }
    assert!(!preview.html.contains("href="));
    assert!(!preview.html.contains("<img"));
    assert_eq!(preview.math.len(), 2);
    assert_eq!(preview.math[0].expression, "x^2");
    assert!(!preview.math[0].display_mode);
    assert!(preview.math[1].display_mode);
    assert!(preview.html.contains(&preview.math[0].id));
}

#[test]
fn retains_tables_code_and_disclosure_html() {
    let preview = render(
        "> Quoted\n\n---\n\n```ts\nconst answer = 42\n```\n\n| Name | Value |\n| --- | --- |\n| answer | 42 |\n\n<details><summary>More</summary>Details</details>",
    );
    for fragment in [
        "<blockquote>",
        "<hr>",
        "<pre><code>",
        "const answer = 42",
        "<table>",
        "<th>Name</th>",
        "<details><summary>More</summary>Details</details>",
    ] {
        assert!(
            preview.html.contains(fragment),
            "missing {fragment}: {}",
            preview.html
        );
    }
}

#[test]
fn removes_scripts_attributes_urls_and_foreign_html() {
    let preview = render(
        "<script>alert(1)</script><style>body{display:none}</style><iframe src='https://evil'></iframe><svg onload='attack()'></svg><p onclick='attack()' style='position:fixed'>Safe <a href='javascript:attack()'>link</a><img src='https://evil' onerror='attack()'></p><span class='fixed inset-0'>text</span>",
    );
    for forbidden in [
        "script",
        "alert(1)",
        "style",
        "iframe",
        "svg",
        "onclick",
        "onerror",
        "https://evil",
        "javascript:",
        "fixed",
        "inset-0",
        "<img",
        "<a ",
    ] {
        assert!(
            !preview.html.contains(forbidden),
            "retained {forbidden}: {}",
            preview.html
        );
    }
    assert!(preview.html.contains("Safe link"));
    assert!(preview.html.contains("text"));
}

#[test]
fn preserves_image_fallback_text_and_escapes_it() {
    let preview =
        render("![](image.png \"Fallback title\") ![](url-only.png) ![<script>](other.png)");
    assert!(preview.html.contains("Fallback title"));
    assert!(preview.html.contains("url-only.png"));
    assert!(preview.html.contains("&lt;script&gt;"));
    assert!(!preview.html.contains("<img"));
}

#[test]
fn applies_input_and_output_limits_without_splitting_unicode() {
    let preview = render(&format!("{}\nSecret tail", "文".repeat(500)));
    assert_eq!(preview.html.matches('文').count(), MAX_INPUT_CHARS);
    assert!(!preview.html.contains("Secret tail"));
    assert!(preview.html.len() <= MAX_HTML_BYTES);
    let preview = render(&"$x$ ".repeat(100));
    assert_eq!(preview.math.len(), MAX_MATH_ITEMS);
    assert!(preview.html.len() <= MAX_HTML_BYTES);
}

#[test]
fn node_details_preview_uses_the_existing_summary_even_in_full_mode() {
    let file = crate::analysis::document::parse(
        "a.md".into(),
        "# Heading\nFirst **line**\nSecond\nThird\nHidden fourth".into(),
    )
    .expect("fixture");
    let index = crate::analysis::Index {
        revision: 1,
        generation: 1,
        scope: "fixture".into(),
        root: "fixture".into(),
        opened_at: 0,
        indexed_at: 0,
        files: [("a.md".into(), std::sync::Arc::new(file))].into(),
        paths: ["a.md".into()].into(),
        epoch: 0,
        fingerprint: String::new(),
    };
    for mode in ["summary", "full"] {
        let result = crate::analysis::graph::details(
            &index,
            crate::analysis::graph::DetailsRequest {
                revision: "1:1".into(),
                node_ids: vec!["file:a.md".into()],
                mode: mode.into(),
                max_nodes: None,
            },
        )
        .expect("graph details");
        let item = &result["items"][0];
        assert_eq!(item["content"], "First **line**\nSecond\nThird");
        let html = item["preview"]["html"].as_str().expect("HTML payload");
        assert!(html.contains("<strong>line</strong>"));
        assert!(!html.contains("Heading"));
        assert!(!html.contains("Hidden fourth"));
        assert!(item["preview"]["math"].is_array());
        assert_eq!(item.get("content_blocks").is_some(), mode == "full");
    }
}
