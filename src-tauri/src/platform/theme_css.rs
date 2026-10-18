use crate::error::{BackendError, BackendResult};
use cssparser::{ParseError, Parser, Token};

pub(super) fn validate(css: &str) -> BackendResult<()> {
    if css.len() > 512 * 1024 {
        return Err(BackendError::new("INVALID_THEME", "Theme exceeds 512 KiB"));
    }
    tokens(&mut Parser::new(css)).map_err(|_| {
        BackendError::new(
            "INVALID_THEME",
            "Theme contains invalid CSS or external resources",
        )
    })
}

fn local_url(value: &str) -> bool {
    value.is_empty()
        || value
            .get(..5)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("data:"))
}

// Tokenize CSS instead of searching raw strings: selectors and escaped
// characters remain valid, while comments/escapes cannot hide an import or URL.
fn tokens(parser: &mut Parser<'_>) -> Result<(), ParseError<()>> {
    while !parser.is_exhausted() {
        match parser.next()?.clone() {
            Token::AtKeyword(name) if name.eq_ignore_ascii_case("import") => {
                return Err(ParseError::custom(()));
            }
            Token::UnquotedUrl(value) if !local_url(&value) => {
                return Err(ParseError::custom(()));
            }
            Token::Function(name) if name.eq_ignore_ascii_case("url") => {
                parser.parse_nested_block(|inner| {
                    let value = inner.expect_string()?.clone();
                    if local_url(&value) {
                        Ok(())
                    } else {
                        Err(ParseError::custom(()))
                    }
                })?;
            }
            Token::Function(_)
            | Token::ParenthesisBlock
            | Token::SquareBracketBlock
            | Token::CurlyBracketBlock => {
                parser.parse_nested_block(tokens)?;
            }
            Token::BadUrl(_) | Token::BadString(_) => return Err(ParseError::custom(())),
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_escaped_selectors_and_inline_assets_without_allowing_external_urls() {
        assert!(validate(r".text\:muted{color:var(--fg)}").is_ok());
        assert!(validate("a{background:url('data:image/png;base64,AA==')}").is_ok());
        for css in [
            r"@\69mport 'outside.css';",
            "a{background:uRl('https://example.com')}",
            r"a{background:url(\68ttps://example.com)}",
            "a{background:url(/**/'https://example.com')}",
        ] {
            assert!(validate(css).is_err(), "{css}");
        }
    }
}
