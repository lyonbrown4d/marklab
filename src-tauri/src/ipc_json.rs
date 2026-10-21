//! A named recursive JSON contract avoids Specta's inline serde_json::Value cycle.
//! Runtime settings remain serde_json values; this mirrors their JSON wire shape.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[allow(dead_code)]
#[derive(Serialize, Deserialize, specta::Type)]
#[serde(untagged)]
pub(crate) enum JsonValue {
  Null(()),
  Boolean(bool),
  Number(#[specta(type = f64)] serde_json::Number),
  String(String),
  Array(Vec<JsonValue>),
  Object(BTreeMap<String, JsonValue>),
}

#[cfg(test)]
mod tests {
  #[test]
  fn named_contract_preserves_nested_json_values_without_tag_wrappers() {
    let value = serde_json::json!({"empty":null,"enabled":true,"count":3,"label":"note","items":[{"fraction":1.5},[false]]});
    let contract: super::JsonValue = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(contract).unwrap(), value);
  }
}
