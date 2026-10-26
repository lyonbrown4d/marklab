use crate::spreadsheet::Sheet;

fn text(value: &str) -> String {
  let mut result = String::new();
  for character in value.chars() {
    match character {
      '&' => result.push_str("&amp;"),
      '<' => result.push_str("&lt;"),
      '>' => result.push_str("&gt;"),
      '\r' => {}
      '\0'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}' | '\u{fffe}' | '\u{ffff}' => {
        result.push('�')
      }
      '\n' => result.push_str("<br>"),
      '\\' | '|' | '*' | '_' | '[' | ']' | '`' | '#' | '!' => {
        result.push('\\');
        result.push(character);
      }
      _ => result.push(character),
    }
  }
  result
}

pub fn render(title: &str, sheets: &[Sheet], locale: &str) -> String {
  let chinese = locale == "zh-CN";
  let mut output = format!("\n\n## {}\n\n", text(title));
  for sheet in sheets {
    output.push_str(&format!("### {}\n\n", text(&sheet.name)));
    let columns = sheet.rows.iter().map(Vec::len).max().unwrap_or(0);
    if columns == 0 {
      output.push_str(if chinese {
        "（空工作表）\n\n"
      } else {
        "(Empty worksheet)\n\n"
      });
    } else {
      output.push('|');
      for index in 0..columns {
        output.push_str(&if chinese {
          format!(" 第 {} 列 |", index + 1)
        } else {
          format!(" Column {} |", index + 1)
        });
      }
      output.push_str("\n|");
      for _ in 0..columns {
        output.push_str(" --- |");
      }
      output.push('\n');
      for (row_index, row) in sheet.rows.iter().enumerate() {
        output.push('|');
        for index in 0..columns {
          output.push(' ');
          if sheet.uncached_cells.contains(&(row_index, index)) {
            output.push_str(if chinese {
              "［公式无已保存值］"
            } else {
              "[formula has no cached value]"
            });
          } else if let Some(value) = row.get(index) {
            output.push_str(&text(value));
          }
          output.push_str(" |");
        }
        output.push('\n');
      }
      output.push('\n');
    }
    if sheet.truncated {
      output.push_str(if chinese {
        "警告：工作表内容已截断。最多导出 500 行、256 列，每个单元格最多 4096 字节，工作簿文本总量最多 1 MiB。\n\n"
      } else {
        "Warning: worksheet content was truncated to 500 rows, 256 columns, 4096 bytes per cell and the 1 MiB workbook text limit.\n\n"
      });
    }
    if sheet.uncached_formulas > 0 {
      output.push_str(&if chinese {
        format!("警告：{} 个公式单元格没有已保存值。请在电子表格应用中打开并保存工作簿，以更新这些值。\n\n", sheet.uncached_formulas)
      } else {
        format!("Warning: {} formula cells have no cached value. Open and save the workbook in a spreadsheet application to refresh these values.\n\n", sheet.uncached_formulas)
      });
    }
  }
  output
}
