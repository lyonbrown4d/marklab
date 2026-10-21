//! JSON transports desktop integers as numbers. Fail instead of silently rounding
//! revision/session identifiers beyond JavaScript's exact integer range. These
//! scalar codecs perform no response-tree walk and allocate no duplicate DTO.
use serde::{Deserialize, Deserializer, Serialize, Serializer};

pub(crate) const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;
pub(crate) trait SafeInteger {
  fn is_safe(&self) -> bool;
}
impl SafeInteger for u64 {
  fn is_safe(&self) -> bool {
    *self <= MAX_SAFE_INTEGER
  }
}
impl SafeInteger for i64 {
  fn is_safe(&self) -> bool {
    self.unsigned_abs() <= MAX_SAFE_INTEGER
  }
}
impl<T: SafeInteger> SafeInteger for Option<T> {
  fn is_safe(&self) -> bool {
    self.as_ref().is_none_or(SafeInteger::is_safe)
  }
}
pub(crate) fn serialize<S: Serializer, T: SafeInteger + Serialize>(
  value: &T,
  serializer: S,
) -> Result<S::Ok, S::Error> {
  if !value.is_safe() {
    return Err(serde::ser::Error::custom(
      "Desktop integer exceeds JavaScript's safe integer range",
    ));
  }
  value.serialize(serializer)
}
pub(crate) fn deserialize<'de, D: Deserializer<'de>, T: SafeInteger + Deserialize<'de>>(
  deserializer: D,
) -> Result<T, D::Error> {
  let value = T::deserialize(deserializer)?;
  if !value.is_safe() {
    return Err(serde::de::Error::custom(
      "Desktop integer exceeds JavaScript's safe integer range",
    ));
  }
  Ok(value)
}

#[cfg(test)]
mod tests {
  use super::*;
  #[derive(Debug, Serialize, Deserialize)]
  struct Revision {
    #[serde(with = "super")]
    revision: u64,
    #[serde(default, with = "super", skip_serializing_if = "Option::is_none")]
    generation: Option<u64>,
  }
  #[test]
  fn exact_integer_boundary_preserves_json_number_wire_and_option_absence() {
    let data = Revision {
      revision: MAX_SAFE_INTEGER,
      generation: None,
    };
    assert_eq!(
      serde_json::to_string(&data).unwrap(),
      "{\"revision\":9007199254740991}"
    );
    assert_eq!(
      serde_json::from_str::<Revision>("{\"revision\":9007199254740991}")
        .unwrap()
        .revision,
      MAX_SAFE_INTEGER
    );
    assert!(
      serde_json::to_string(&Revision {
        revision: MAX_SAFE_INTEGER + 1,
        generation: None
      })
      .is_err()
    );
    assert!(serde_json::from_str::<Revision>("{\"revision\":9007199254740992}").is_err());
    assert!(
      serde_json::from_str::<Revision>("{\"revision\":1,\"generation\":9007199254740992}").is_err()
    );
  }

  #[test]
  fn signed_integer_boundaries_reject_rounding_in_both_directions() {
    #[derive(Serialize, Deserialize)]
    struct Signed {
      #[serde(with = "super")]
      value: i64,
    }
    for value in [MAX_SAFE_INTEGER as i64, -(MAX_SAFE_INTEGER as i64)] {
      let json = serde_json::to_string(&Signed { value }).unwrap();
      assert_eq!(serde_json::from_str::<Signed>(&json).unwrap().value, value);
    }
    for value in [
      MAX_SAFE_INTEGER as i64 + 1,
      -(MAX_SAFE_INTEGER as i64) - 1,
      i64::MIN,
    ] {
      assert!(serde_json::to_string(&Signed { value }).is_err());
      assert!(serde_json::from_str::<Signed>(&format!("{{\"value\":{value}}}")).is_err());
    }
  }
}
