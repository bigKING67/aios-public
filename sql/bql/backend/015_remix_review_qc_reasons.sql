-- P3: keep prior decisions valid while adding the two explicit rejection reasons.
ALTER TABLE ads.content_remix_output_reviews
    DROP CONSTRAINT content_remix_output_reviews_reason_keys_check;
ALTER TABLE ads.content_remix_output_reviews
    ADD CONSTRAINT content_remix_output_reviews_reason_keys_check CHECK (
        reasons <@ ARRAY['duplicate_picture', 'voice_break', 'wrong_product',
                        'pacing', 'other', 'frame_drop', 'wrong_framework']::TEXT[]
    );
