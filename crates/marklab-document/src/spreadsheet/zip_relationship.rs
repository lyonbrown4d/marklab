use super::limits;
use crate::error::BackendResult;
use quick_xml::events::BytesStart;

pub fn check(element: &BytesStart<'_>) -> BackendResult<()> {
  let mut kind = None;
  let mut target = None;
  for attribute in element.attributes() {
    let attribute = attribute.map_err(|_| limits::invalid("Invalid workbook relationship"))?;
    match attribute.key.as_ref() {
      "Type" => kind = Some(attribute.value.into_owned()),
      "Target" => target = Some(attribute.value.into_owned()),
      _ => {}
    }
  }
  // Calamine accepts these relationship types for sheet parts. Their targets
  // must pass the XML guards before its formula reader can touch them.
  if kind
    .as_deref()
    .and_then(|kind| kind.rsplit('/').next())
    .is_some_and(|kind| matches!(kind, "worksheet" | "chartsheet" | "dialogsheet"))
    && target
      .as_deref()
      .is_none_or(|target| !target.to_ascii_lowercase().ends_with(".xml"))
  {
    return Err(limits::invalid(
      "Worksheet archive parts must use the XML extension",
    ));
  }
  Ok(())
}
