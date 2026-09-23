use super::super::{
    summary_normalization::{normalize_summary_text_numbers, normalize_summary_text_percentages},
    Conclusions,
};

pub(in crate::reports) fn sanitize_summary_conclusions(conclusions: Conclusions) -> Conclusions {
    let normalize_text = |text: &str| -> String {
        let percentage_normalized = normalize_summary_text_percentages(text.trim());
        normalize_summary_text_numbers(percentage_normalized.as_str())
    };

    let normalize_lines = |values: Vec<String>| -> Vec<String> {
        values
            .into_iter()
            .map(|value| normalize_text(value.as_str()))
            .filter(|value| !value.is_empty())
            .collect()
    };

    Conclusions {
        overall: normalize_text(conclusions.overall.as_str()),
        highlights: normalize_lines(conclusions.highlights),
        risks: normalize_lines(conclusions.risks),
    }
}
