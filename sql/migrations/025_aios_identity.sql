-- Rename legacy public auth/audit identities without copying or deleting data.
-- Keep migration history immutable; apply only through the governed release path.
DO $$
DECLARE
    old_name TEXT;
    new_name TEXT;
    item RECORD;
BEGIN
    FOREACH old_name IN ARRAY ARRAY[
        'ods_datahub_users', 'ods_datahub_roles', 'ods_datahub_permissions',
        'ods_datahub_user_roles', 'ods_datahub_role_permissions',
        'ods_datahub_refresh_tokens', 'ods_datahub_audit_logs'
    ] LOOP
        new_name := REPLACE(old_name, 'datahub', 'aios');
        IF TO_REGCLASS(FORMAT('public.%I', old_name)) IS NOT NULL THEN
            IF TO_REGCLASS(FORMAT('public.%I', new_name)) IS NOT NULL THEN
                RAISE EXCEPTION 'Both old and new AIOS identity tables exist: % / %', old_name, new_name;
            END IF;
            EXECUTE FORMAT('ALTER TABLE public.%I RENAME TO %I', old_name, new_name);
        END IF;
    END LOOP;
    FOR item IN
        SELECT c.relname AS table_name, k.conname
        FROM pg_constraint k
        JOIN pg_class c ON c.oid = k.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname LIKE 'ods_aios_%'
          AND k.conname LIKE '%datahub%'
    LOOP
        EXECUTE FORMAT('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
            item.table_name, item.conname, REPLACE(item.conname, 'datahub', 'aios'));
    END LOOP;
    FOR item IN
        SELECT c.relname, c.relkind
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('S', 'i')
          AND (c.relname LIKE 'ods_datahub_%' OR c.relname LIKE 'idx_ods_datahub_%')
    LOOP
        EXECUTE FORMAT('ALTER %s public.%I RENAME TO %I',
            CASE WHEN item.relkind = 'S' THEN 'SEQUENCE' ELSE 'INDEX' END,
            item.relname, REPLACE(item.relname, 'datahub', 'aios'));
    END LOOP;
END $$;
