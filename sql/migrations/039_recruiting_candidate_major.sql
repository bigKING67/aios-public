-- Add the V3 candidate major; preserve legacy availability and start-date data.
ALTER TABLE ads.recruiting_test_submissions
    ADD COLUMN major TEXT NOT NULL DEFAULT '';
