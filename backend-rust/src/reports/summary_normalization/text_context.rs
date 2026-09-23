pub(super) fn has_any_keyword(text: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|keyword| text.contains(keyword))
}

pub(super) fn floor_char_boundary(value: &str, index: usize) -> usize {
    if index >= value.len() {
        return value.len();
    }
    let mut cursor = index;
    while cursor > 0 && !value.is_char_boundary(cursor) {
        cursor -= 1;
    }
    cursor
}

pub(super) fn ceil_char_boundary(value: &str, index: usize) -> usize {
    if index >= value.len() {
        return value.len();
    }
    let mut cursor = index;
    while cursor < value.len() && !value.is_char_boundary(cursor) {
        cursor += 1;
    }
    cursor
}
