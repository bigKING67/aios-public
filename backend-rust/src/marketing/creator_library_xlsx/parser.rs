use crate::{
    error::AppResult,
    marketing::types::{MAX_IMPORT_ROWS, TEMPLATE_SHEET_NAME},
    xlsx::{parse_xlsx_rows, validate_xlsx_upload_metadata},
};

use super::{MAX_CREATOR_LIBRARY_XLSX_BYTES, MAX_CREATOR_LIBRARY_XLSX_COLUMNS};

pub(in crate::marketing) fn validate_creator_library_xlsx_upload_metadata(
    file_name: Option<&str>,
    content_type: Option<&str>,
) -> AppResult<()> {
    validate_xlsx_upload_metadata(file_name, content_type)
}

pub(in crate::marketing) fn parse_creator_library_xlsx(
    bytes: &[u8],
) -> AppResult<Vec<Vec<String>>> {
    parse_xlsx_rows(
        bytes,
        MAX_CREATOR_LIBRARY_XLSX_BYTES,
        MAX_IMPORT_ROWS,
        MAX_CREATOR_LIBRARY_XLSX_COLUMNS,
        TEMPLATE_SHEET_NAME,
    )
}

#[cfg(test)]
mod tests {
    use rust_xlsxwriter::Workbook;

    use super::parse_creator_library_xlsx;
    use crate::marketing::{
        creator_library_xlsx::{
            validate_creator_library_xlsx_upload_metadata, MAX_CREATOR_LIBRARY_XLSX_BYTES,
            MAX_CREATOR_LIBRARY_XLSX_COLUMNS,
        },
        types::{MAX_IMPORT_ROWS, TEMPLATE_SHEET_NAME},
    };

    fn workbook_bytes(
        build: impl FnOnce(&mut Workbook) -> Result<(), rust_xlsxwriter::XlsxError>,
    ) -> Vec<u8> {
        let mut workbook = Workbook::new();
        build(&mut workbook).expect("build workbook fixture");
        workbook.save_to_buffer().expect("save workbook fixture")
    }

    #[test]
    fn prefers_named_creator_sheet_over_first_sheet() {
        let bytes = workbook_bytes(|workbook| {
            let first = workbook.add_worksheet();
            first.set_name("其他")?;
            first.write_string(0, 0, "错误表头")?;

            let target = workbook.add_worksheet();
            target.set_name(TEMPLATE_SHEET_NAME)?;
            target.write_string(0, 0, "达人ID")?;
            target.write_string(1, 0, "creator-001")?;
            Ok(())
        });

        let rows = parse_creator_library_xlsx(&bytes).expect("parse named sheet");

        assert_eq!(rows, vec![vec!["达人ID"], vec!["creator-001"]]);
    }

    #[test]
    fn falls_back_to_first_sheet_and_normalizes_cell_types() {
        let bytes = workbook_bytes(|workbook| {
            let sheet = workbook.add_worksheet();
            sheet.set_name("Sheet1")?;
            sheet.write_string(0, 0, " 文本 ")?;
            sheet.write_number(0, 1, 42)?;
            sheet.write_number(0, 2, 12.5)?;
            sheet.write_boolean(0, 3, true)?;
            Ok(())
        });

        let rows = parse_creator_library_xlsx(&bytes).expect("parse fallback sheet");

        assert_eq!(rows, vec![vec!["文本", "42", "12.5", "true"]]);
    }

    #[test]
    fn accepts_empty_sheet_without_inventing_rows() {
        let bytes = workbook_bytes(|workbook| {
            workbook.add_worksheet().set_name(TEMPLATE_SHEET_NAME)?;
            Ok(())
        });

        assert!(parse_creator_library_xlsx(&bytes)
            .expect("parse empty sheet")
            .is_empty());
    }

    #[test]
    fn rejects_malformed_oversized_and_unbounded_workbooks() {
        let malformed =
            parse_creator_library_xlsx(b"not-an-xlsx").expect_err("malformed workbook should fail");
        assert_eq!(malformed.detail(), "XLSX 文件损坏或格式不受支持");

        let oversized = parse_creator_library_xlsx(&vec![0; MAX_CREATOR_LIBRARY_XLSX_BYTES + 1])
            .expect_err("oversized workbook should fail");
        assert_eq!(oversized.detail(), "XLSX 文件不能超过 5 MB");

        let too_many_rows = workbook_bytes(|workbook| {
            let sheet = workbook.add_worksheet();
            sheet.write_string(0, 0, "达人ID")?;
            sheet.write_string((MAX_IMPORT_ROWS + 1) as u32, 0, "creator-over-limit")?;
            Ok(())
        });
        assert_eq!(
            parse_creator_library_xlsx(&too_many_rows)
                .expect_err("row limit should fail")
                .detail(),
            format!("单次最多解析 {} 行", MAX_IMPORT_ROWS)
        );

        let too_many_columns = workbook_bytes(|workbook| {
            let sheet = workbook.add_worksheet();
            sheet.write_string(0, MAX_CREATOR_LIBRARY_XLSX_COLUMNS as u16, "too-wide")?;
            Ok(())
        });
        assert_eq!(
            parse_creator_library_xlsx(&too_many_columns)
                .expect_err("column limit should fail")
                .detail(),
            format!(
                "XLSX 工作表最多支持 {} 列",
                MAX_CREATOR_LIBRARY_XLSX_COLUMNS
            )
        );
    }

    #[test]
    fn validates_xlsx_filename_or_content_type() {
        assert!(validate_creator_library_xlsx_upload_metadata(
            Some("CREATORS.XLSX"),
            Some("application/octet-stream")
        )
        .is_ok());
        assert!(validate_creator_library_xlsx_upload_metadata(
            None,
            Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        )
        .is_ok());
        assert_eq!(
            validate_creator_library_xlsx_upload_metadata(Some("creators.csv"), Some("text/csv"))
                .expect_err("csv metadata should fail")
                .detail(),
            "仅支持 XLSX 文件"
        );
    }
}
