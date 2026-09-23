use serde_json::Value;
use sqlx::{postgres::PgRow, Row};

use super::types::{
    ContentAssetAdMaterial, ContentAssetEvent, ContentAssetImportRun, ContentAssetItem,
    ContentAssetObject, ContentAssetPlatformVideo, ContentAssetProcessingJob, ContentAssetSource,
    ContentAssetTranscript,
};

pub(super) fn asset_from_row(row: &PgRow) -> ContentAssetItem {
    ContentAssetItem {
        asset_id: row.get("asset_id"),
        title: row.try_get("title").unwrap_or_default(),
        asset_type: row.try_get("asset_type").unwrap_or_default(),
        asset_status: row.try_get("asset_status").unwrap_or_default(),
        profile_status: row.try_get("profile_status").unwrap_or_default(),
        lifecycle_status: row.try_get("lifecycle_status").unwrap_or_default(),
        external_only: row.try_get("external_only").unwrap_or(false),
        bucket: row.try_get("bucket").unwrap_or_default(),
        raw_object_key: row.try_get("raw_object_key").ok(),
        preview_object_key: row.try_get("preview_object_key").ok(),
        cover_object_key: row.try_get("cover_object_key").ok(),
        transcript_object_key: row.try_get("transcript_object_key").ok(),
        cover_url: None,
        raw_sha256: row.try_get("raw_sha256").ok(),
        file_ext: row.try_get("file_ext").ok(),
        mime_type: row.try_get("mime_type").ok(),
        duration_seconds: row.try_get("duration_seconds").ok(),
        width: row.try_get("width").ok(),
        height: row.try_get("height").ok(),
        file_size_bytes: row.try_get("file_size_bytes").ok(),
        preview_size_bytes: row.try_get("preview_size_bytes").ok(),
        platform: row.try_get("platform").ok(),
        platform_names: row
            .try_get::<Vec<String>, _>("platform_names")
            .unwrap_or_default(),
        product_name: row.try_get("product_name").ok(),
        product_names: row
            .try_get::<Vec<String>, _>("product_names")
            .unwrap_or_default(),
        sku_names: row
            .try_get::<Vec<String>, _>("sku_names")
            .unwrap_or_default(),
        creator_name: row.try_get("creator_name").ok(),
        video_type: row.try_get("video_type").ok(),
        content_scene: row.try_get("content_scene").ok(),
        content_scene_group: row.try_get("content_scene_group").ok(),
        content_scene_subtype: row.try_get("content_scene_subtype").ok(),
        owner_name: row.try_get("owner_name").ok(),
        owner_user_id: row.try_get("owner_user_id").ok(),
        uploaded_by_user_id: row.try_get("uploaded_by_user_id").ok(),
        can_edit: row.try_get("can_edit").unwrap_or(false),
        tags: row.try_get::<Vec<String>, _>("tags").unwrap_or_default(),
        ai_suggested_title: row.try_get("ai_suggested_title").ok(),
        ai_suggested_tags: row
            .try_get::<Vec<String>, _>("ai_suggested_tags")
            .unwrap_or_default(),
        ai_metadata_generated_at: row.try_get("ai_metadata_generated_at").ok(),
        title_source: row.try_get("title_source").unwrap_or_default(),
        tags_source: row.try_get("tags_source").unwrap_or_default(),
        notes: row.try_get("notes").ok(),
        authorization_status: row.try_get("authorization_status").unwrap_or_default(),
        commercial_use_allowed: row.try_get("commercial_use_allowed").ok(),
        repurpose_allowed: row.try_get("repurpose_allowed").ok(),
        authorization_starts_at: row.try_get("authorization_starts_at").ok(),
        authorization_expires_at: row.try_get("authorization_expires_at").ok(),
        authorization_notes: row.try_get("authorization_notes").ok(),
        ai_summary: row.try_get("ai_summary").ok(),
        ai_score: row.try_get("ai_score").ok(),
        ai_analysis_source: row.try_get("ai_analysis_source").ok(),
        ai_analysis_model: row.try_get("ai_analysis_model").ok(),
        ai_analyzed_at: row.try_get("ai_analyzed_at").ok(),
        transcript_source: row.try_get("transcript_source").ok(),
        transcript_model: row.try_get("transcript_model").ok(),
        transcribed_at: row.try_get("transcribed_at").ok(),
        script_excerpt: row.try_get("script_excerpt").ok(),
        roi: row.try_get("roi").ok(),
        ctr: row.try_get("ctr").ok(),
        cvr: row.try_get("cvr").ok(),
        spend: row.try_get("spend").ok(),
        gmv: row.try_get("gmv").ok(),
        source_type: row.try_get("source_type").unwrap_or_default(),
        source_platform: row.try_get("source_platform").ok(),
        source_url: row.try_get("source_url").ok(),
        source_sheet_id: row.try_get("source_sheet_id").ok(),
        source_sheet_name: row.try_get("source_sheet_name").ok(),
        source_row_index: row.try_get("source_row_index").ok(),
        uploaded_at: row.try_get("uploaded_at").ok(),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}

pub(super) fn transcript_from_row(row: &PgRow) -> ContentAssetTranscript {
    ContentAssetTranscript {
        transcript_id: row.get("transcript_id"),
        asset_id: row.get("asset_id"),
        source_object_key: row.try_get("source_object_key").unwrap_or_default(),
        transcript_object_key: row.try_get("transcript_object_key").unwrap_or_default(),
        provider: row.try_get("provider").unwrap_or_default(),
        model: row.try_get("model").unwrap_or_default(),
        language: row.try_get("language").ok(),
        status: row.try_get("status").unwrap_or_default(),
        transcript_text: row.try_get("transcript_text").unwrap_or_default(),
        script_text: row.try_get("script_text").unwrap_or_default(),
        srt_text: row.try_get("srt_text").unwrap_or_default(),
        segments: row.try_get::<Value, _>("segments").unwrap_or(Value::Null),
        duration_seconds: row.try_get("duration_seconds").ok(),
        word_count: row.try_get("word_count").ok(),
        confidence: row.try_get("confidence").ok(),
        metadata: row.try_get::<Value, _>("metadata").unwrap_or(Value::Null),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}

pub(super) fn object_from_row(row: &PgRow) -> ContentAssetObject {
    ContentAssetObject {
        object_id: row.get("object_id"),
        asset_id: row.get("asset_id"),
        object_role: row.try_get("object_role").unwrap_or_default(),
        storage_provider: row.try_get("storage_provider").unwrap_or_default(),
        bucket: row.try_get("bucket").unwrap_or_default(),
        object_key: row.try_get("object_key").unwrap_or_default(),
        content_type: row.try_get("content_type").ok(),
        file_ext: row.try_get("file_ext").ok(),
        size_bytes: row.try_get("size_bytes").ok(),
        sha256: row.try_get("sha256").ok(),
        status: row.try_get("status").unwrap_or_default(),
        metadata: row
            .try_get("metadata")
            .unwrap_or_else(|_| serde_json::json!({})),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

pub(super) fn platform_video_from_row(row: &PgRow) -> ContentAssetPlatformVideo {
    ContentAssetPlatformVideo {
        platform_video_id: row.get("platform_video_id"),
        asset_id: row.get("asset_id"),
        platform: row.try_get("platform").unwrap_or_default(),
        account_id: row.try_get("account_id").ok(),
        account_name: row.try_get("account_name").ok(),
        advertiser_id: row.try_get("advertiser_id").ok(),
        external_video_id: row.try_get("external_video_id").ok(),
        external_item_id: row.try_get("external_item_id").ok(),
        external_note_id: row.try_get("external_note_id").ok(),
        external_url: row.try_get("external_url").ok(),
        publish_title: row.try_get("publish_title").ok(),
        publish_status: row.try_get("publish_status").unwrap_or_default(),
        relation_status: row.try_get("relation_status").unwrap_or_default(),
        source: row.try_get("source").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

pub(super) fn ad_material_from_row(row: &PgRow) -> ContentAssetAdMaterial {
    ContentAssetAdMaterial {
        ad_material_id: row.get("ad_material_id"),
        asset_id: row.get("asset_id"),
        platform_video_id: row.try_get("platform_video_id").ok(),
        ad_platform: row.try_get("ad_platform").unwrap_or_default(),
        account_id: row.try_get("account_id").ok(),
        account_name: row.try_get("account_name").ok(),
        advertiser_id: row.try_get("advertiser_id").ok(),
        external_material_id: row.try_get("external_material_id").unwrap_or_default(),
        external_video_id: row.try_get("external_video_id").ok(),
        material_name: row.try_get("material_name").ok(),
        material_title: row.try_get("material_title").ok(),
        material_status: row.try_get("material_status").unwrap_or_default(),
        relation_status: row.try_get("relation_status").unwrap_or_default(),
        source: row.try_get("source").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

pub(super) fn source_from_row(row: &PgRow) -> ContentAssetSource {
    ContentAssetSource {
        source_id: row.try_get("source_id").unwrap_or_default(),
        source_kind: row.try_get("source_kind").unwrap_or_default(),
        source_url: row.try_get("source_url").ok(),
        source_title: row.try_get("source_title").ok(),
        feishu_file_token: row.try_get("feishu_file_token").ok(),
        feishu_sheet_id: row.try_get("feishu_sheet_id").ok(),
        feishu_sheet_name: row.try_get("feishu_sheet_name").ok(),
        feishu_row_index: row.try_get("feishu_row_index").ok(),
        external_platform: row.try_get("external_platform").ok(),
        external_status: row.try_get("external_status").unwrap_or_default(),
        metadata: row.try_get::<Value, _>("metadata").unwrap_or(Value::Null),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

pub(super) fn event_from_row(row: &PgRow) -> ContentAssetEvent {
    ContentAssetEvent {
        event_id: row.try_get("event_id").unwrap_or_default(),
        event_type: row.try_get("event_type").unwrap_or_default(),
        actor: row.try_get("actor").ok(),
        message: row.try_get("message").ok(),
        payload: row.try_get::<Value, _>("payload").unwrap_or(Value::Null),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

pub(super) fn import_run_from_row(row: &PgRow) -> ContentAssetImportRun {
    ContentAssetImportRun {
        run_id: row.get("run_id"),
        mode: row.try_get("mode").unwrap_or_default(),
        status: row.try_get("status").unwrap_or_default(),
        source_url: row.try_get("source_url").unwrap_or_default(),
        spreadsheet_token: row.try_get("spreadsheet_token").ok(),
        sheet_ids: row
            .try_get::<Vec<String>, _>("sheet_ids")
            .unwrap_or_default(),
        dry_run_payload: row
            .try_get::<Value, _>("dry_run_payload")
            .unwrap_or(Value::Null),
        total_rows: row.try_get("total_rows").unwrap_or_default(),
        attachment_count: row.try_get("attachment_count").unwrap_or_default(),
        uploaded_count: row.try_get("uploaded_count").unwrap_or_default(),
        external_only_count: row.try_get("external_only_count").unwrap_or_default(),
        failed_count: row.try_get("failed_count").unwrap_or_default(),
        error_message: row.try_get("error_message").ok(),
        requested_by: row.try_get("requested_by").ok(),
        created_at: row.try_get("created_at").unwrap_or_default(),
        finished_at: row.try_get("finished_at").ok(),
    }
}

pub(super) fn processing_job_from_row(row: &PgRow) -> ContentAssetProcessingJob {
    ContentAssetProcessingJob {
        job_id: row.get("job_id"),
        asset_id: row.get("asset_id"),
        title: row.try_get("title").unwrap_or_default(),
        asset_status: row.try_get("asset_status").unwrap_or_default(),
        duration_seconds: row.try_get("duration_seconds").ok(),
        job_type: row.try_get("job_type").unwrap_or_default(),
        status: row.try_get("status").unwrap_or_default(),
        attempts: row.try_get("attempts").unwrap_or_default(),
        max_attempts: row.try_get("max_attempts").unwrap_or_default(),
        input_object_key: row.try_get("input_object_key").ok(),
        output_object_key: row.try_get("output_object_key").ok(),
        metadata: row.try_get::<Value, _>("metadata").unwrap_or(Value::Null),
        error_message: row.try_get("error_message").ok(),
        queued_at: row.try_get("queued_at").unwrap_or_default(),
        started_at: row.try_get("started_at").ok(),
        finished_at: row.try_get("finished_at").ok(),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}
