use std::borrow::Cow;

use specta::{
  Format, Types,
  datatype::{DataType, Fields, Function, NamedDataType, NamedReferenceType, Reference},
};
use specta_util::Remapper;

// IPC codecs reject integers outside JavaScript's safe range; their JSON wire
// representation remains a number. Apply this after Serde chooses wire shapes.
#[derive(Default)]
pub(super) struct WireFormat;

impl Format for WireFormat {
  fn map_types(&self, types: &Types) -> Result<Cow<'_, Types>, specta::FormatError> {
    let types = specta_serde::PhasesFormat.map_types(types)?;
    Ok(Cow::Owned(numbers().remap_types(types.into_owned())))
  }

  fn map_type(
    &self,
    types: &Types,
    dt: &DataType,
  ) -> Result<Cow<'_, DataType>, specta::FormatError> {
    let dt = specta_serde::PhasesFormat.map_type(types, dt)?;
    Ok(Cow::Owned(numbers().remap_dt(dt.into_owned())))
  }
}

fn numbers() -> Remapper {
  Remapper::new().dangerous_bigints_as_number()
}

fn is_result(named: &NamedDataType) -> bool {
  named.name == "Result" && matches!(named.module_path.as_ref(), "core::result" | "std::result")
}

// Tauri resolves Ok payloads and rejects Err payloads. Only the outer Result
// belongs to transport handling; nested Results retain their ordinary shape.
pub(super) fn success<'a>(dt: &'a DataType, types: &Types) -> &'a DataType {
  if let DataType::Reference(Reference::Named(reference)) = dt
    && types.get(reference).is_some_and(is_result)
    && let NamedReferenceType::Reference { generics, .. } = &reference.inner
    && let Some((_, ok)) = generics.first()
  {
    ok
  } else {
    dt
  }
}

pub(super) fn hide_transport_result(types: &mut Types, commands: &[Function]) {
  let used = commands.iter().any(|command| {
    command
      .args()
      .iter()
      .any(|(_, dt)| contains_result(dt, types))
      || command
        .result()
        .is_some_and(|dt| contains_result(success(dt, types), types))
  }) || types.into_unsorted_iter().any(|named| {
    !is_result(named)
      && named
        .ty
        .as_ref()
        .is_some_and(|dt| contains_result(dt, types))
  });
  if !used {
    types.iter_mut(|named| {
      if is_result(named) {
        named.ty = None;
      }
    });
  }
}

fn contains_result(dt: &DataType, types: &Types) -> bool {
  match dt {
    DataType::Reference(Reference::Named(reference)) => {
      types.get(reference).is_some_and(is_result)
        || match &reference.inner {
          NamedReferenceType::Reference { generics, .. } => {
            generics.iter().any(|(_, dt)| contains_result(dt, types))
          }
          NamedReferenceType::Inline { dt, .. } => contains_result(dt, types),
          NamedReferenceType::Recursive(_) => false,
        }
    }
    DataType::List(list) => contains_result(&list.ty, types),
    DataType::Map(map) => {
      contains_result(map.key_ty(), types) || contains_result(map.value_ty(), types)
    }
    DataType::Struct(value) => fields_contain_result(&value.fields, types),
    DataType::Enum(value) => value
      .variants
      .iter()
      .any(|(_, v)| fields_contain_result(&v.fields, types)),
    DataType::Tuple(value) => value.elements.iter().any(|dt| contains_result(dt, types)),
    DataType::Nullable(dt) => contains_result(dt, types),
    DataType::Intersection(values) => values.iter().any(|dt| contains_result(dt, types)),
    DataType::Primitive(_) | DataType::Generic(_) | DataType::Reference(Reference::Opaque(_)) => {
      false
    }
  }
}

fn fields_contain_result(fields: &Fields, types: &Types) -> bool {
  match fields {
    Fields::Unit => false,
    Fields::Named(value) => value.fields.iter().any(|(_, field)| {
      field
        .ty
        .as_ref()
        .is_some_and(|dt| contains_result(dt, types))
    }),
    Fields::Unnamed(value) => value.fields.iter().any(|field| {
      field
        .ty
        .as_ref()
        .is_some_and(|dt| contains_result(dt, types))
    }),
  }
}
