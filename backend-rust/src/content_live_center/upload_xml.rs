use super::uploads::CompletedMultipartUploadPart;

pub(super) struct MultipartListPartsPage {
    pub(super) parts: Vec<CompletedMultipartUploadPart>,
    pub(super) next_part_number_marker: Option<i32>,
    pub(super) is_truncated: bool,
}

pub(super) fn build_complete_multipart_xml(parts: &[CompletedMultipartUploadPart]) -> String {
    let mut body = String::from("<CompleteMultipartUpload>");
    for part in parts {
        body.push_str("<Part>");
        body.push_str("<PartNumber>");
        body.push_str(&part.part_number.to_string());
        body.push_str("</PartNumber>");
        body.push_str("<ETag>");
        body.push_str(xml_escape(part.etag.as_str()).as_str());
        body.push_str("</ETag>");
        body.push_str("</Part>");
    }
    body.push_str("</CompleteMultipartUpload>");
    body
}

pub(super) fn parse_list_parts_response(body: &str) -> MultipartListPartsPage {
    let mut parts = Vec::new();
    let mut cursor = 0;
    while let Some(relative_start) = body[cursor..].find("<Part>") {
        let start = cursor + relative_start + "<Part>".len();
        let Some(relative_end) = body[start..].find("</Part>") else {
            break;
        };
        let end = start + relative_end;
        let part_body = &body[start..end];
        let part_number = extract_xml_tag(part_body, "PartNumber")
            .and_then(|value| value.trim().parse::<i32>().ok())
            .unwrap_or(0);
        let etag = extract_xml_tag(part_body, "ETag")
            .map(|value| value.trim().to_string())
            .unwrap_or_default();
        if part_number > 0 && !etag.is_empty() {
            parts.push(CompletedMultipartUploadPart { part_number, etag });
        }
        cursor = end + "</Part>".len();
    }

    let is_truncated = extract_xml_tag(body, "IsTruncated")
        .map(|value| value.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let next_part_number_marker = extract_xml_tag(body, "NextPartNumberMarker")
        .and_then(|value| value.trim().parse::<i32>().ok());

    MultipartListPartsPage {
        parts,
        next_part_number_marker,
        is_truncated,
    }
}

pub(super) fn extract_xml_tag(body: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = body.find(open.as_str())? + open.len();
    let end = body[start..].find(close.as_str())? + start;
    Some(xml_unescape(&body[start..end]))
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn xml_unescape(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}
