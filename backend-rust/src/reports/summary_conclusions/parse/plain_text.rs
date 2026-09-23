use super::super::super::Conclusions;

enum PlainTextSection {
    None,
    Overall,
    Highlights,
    Risks,
}

pub(super) fn parse_conclusions_from_plain_text(raw_text: &str) -> anyhow::Result<Conclusions> {
    let normalized_lines = normalized_plain_text_lines(raw_text);

    if normalized_lines.is_empty() {
        anyhow::bail!("plain text summary is empty");
    }

    let mut overall: Option<String> = None;
    let mut highlights: Vec<String> = Vec::new();
    let mut risks: Vec<String> = Vec::new();
    let mut section = PlainTextSection::None;

    for line in normalized_lines {
        if let Some(next_section) = detect_section(line.as_str()) {
            section = next_section;
            continue;
        }

        match section {
            PlainTextSection::Overall => {
                if overall.is_none() {
                    overall = Some(line);
                } else {
                    highlights.push(line);
                }
            }
            PlainTextSection::Highlights => highlights.push(line),
            PlainTextSection::Risks => risks.push(line),
            PlainTextSection::None => {
                if overall.is_none() {
                    overall = Some(line);
                } else {
                    highlights.push(line);
                }
            }
        }
    }

    let overall = overall.unwrap_or_default().trim().to_string();
    if overall.is_empty() {
        anyhow::bail!("plain text summary missing overall");
    }

    truncate_section_items(&mut highlights);
    truncate_section_items(&mut risks);

    Ok(Conclusions {
        overall,
        highlights,
        risks,
    })
}

fn normalized_plain_text_lines(raw_text: &str) -> Vec<String> {
    raw_text
        .lines()
        .map(|line| {
            line.trim()
                .trim_start_matches('-')
                .trim_start_matches('*')
                .trim_start_matches('•')
                .trim()
                .to_string()
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
}

fn detect_section(line: &str) -> Option<PlainTextSection> {
    let lower = line.to_lowercase();
    if line.contains("总体概况")
        || line.contains("总体结论")
        || lower.starts_with("overall")
        || lower.contains("overall:")
    {
        return Some(PlainTextSection::Overall);
    }

    if line.contains("业务亮点")
        || line.contains("关键亮点")
        || line.contains("亮点")
        || lower.starts_with("highlights")
        || lower.contains("highlights:")
    {
        return Some(PlainTextSection::Highlights);
    }

    if line.contains("潜在风险")
        || line.contains("主要风险")
        || line.contains("风险")
        || lower.starts_with("risks")
        || lower.contains("risks:")
    {
        return Some(PlainTextSection::Risks);
    }

    None
}

fn truncate_section_items(items: &mut Vec<String>) {
    if items.len() > 8 {
        items.truncate(8);
    }
}
