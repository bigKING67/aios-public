pub(in crate::dashboard::notes) struct CreateNoteInput<'a> {
    pub note_date: &'a str,
    pub platform: &'a str,
    pub metric_key: Option<&'a str>,
    pub action_text: &'a str,
    pub reason_text: &'a str,
    pub summary_text: &'a str,
    pub actor_id: &'a str,
}

pub(in crate::dashboard::notes) struct UpdateNoteInput<'a> {
    pub note_id: i64,
    pub metric_key: Option<&'a str>,
    pub action_text: &'a str,
    pub reason_text: &'a str,
    pub summary_text: &'a str,
    pub actor_id: &'a str,
}
