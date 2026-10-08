use super::{domain, tests::input, types::CreateRunRequest};
#[test]
fn automatic_repair_is_explicit_bounded_consent() {
    let original = serde_json::to_value(input()).unwrap();
    assert!(original.get("maxAutoRepairs").is_none());
    assert_eq!(
        serde_json::from_value::<CreateRunRequest>(original)
            .unwrap()
            .max_auto_repairs,
        0
    );
    let mut request = input();
    request.max_auto_repairs = 1;
    assert!(domain::validate_request(&request).is_err());
    request.task_type = "picture_remix".into();
    request.asset_ids.push(uuid::Uuid::new_v4());
    request.narration_asset_id = Some(request.asset_ids[0]);
    request.review_before_production = false;
    assert!(domain::validate_request(&request).is_ok());
    request.max_auto_repairs = 2;
    assert!(domain::validate_request(&request).is_ok());
    request.max_auto_repairs = 3;
    assert!(domain::validate_request(&request).is_err());
    request.max_auto_repairs = 1;
    request.model_call_confirmed = false;
    assert!(domain::validate_request(&request).is_err());
}
