import { db } from "./pool.js";

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_admin BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_custom BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (LOWER(email)) WHERE email IS NOT NULL AND email <> ''`,
  `CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS organization_members (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username),
    role TEXT NOT NULL CHECK (role IN ('org_admin', 'registration_admin', 'org_team_admin', 'org_write', 'org_read')),
    PRIMARY KEY (organization_id, username)
  )`,
  `CREATE TABLE IF NOT EXISTS org_invites (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    secret_hash TEXT NOT NULL,
    keyword TEXT NOT NULL,
    invited_by TEXT NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ
  )`,
  `ALTER TABLE org_invites ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'org_read'`,
  `ALTER TABLE org_invites DROP CONSTRAINT IF EXISTS org_invites_role_check`,
  `ALTER TABLE org_invites ADD CONSTRAINT org_invites_role_check
     CHECK (role IN ('org_admin', 'registration_admin', 'org_team_admin', 'org_write', 'org_read'))`,
  `CREATE TABLE IF NOT EXISTS org_teams (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    members TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    read_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL,
    username TEXT NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL,
    what_people_say TEXT NOT NULL DEFAULT '',
    biblical_teaching INT NOT NULL,
    biblical_teaching_notes TEXT NOT NULL DEFAULT '',
    merch_help INT NOT NULL,
    merch_help_notes TEXT NOT NULL DEFAULT '',
    fun INT NOT NULL,
    fun_notes TEXT NOT NULL DEFAULT '',
    criticisms TEXT NOT NULL DEFAULT '',
    cost TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS share_listings (
    id TEXT PRIMARY KEY,
    year INT NOT NULL,
    publisher_id TEXT NOT NULL,
    title TEXT NOT NULL,
    item TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    available_on DATE NOT NULL,
    contact TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS share_attachments (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL REFERENCES share_listings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size INT NOT NULL,
    object_key TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS setup_posts (
    id TEXT PRIMARY KEY,
    year INT NOT NULL,
    publisher_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    video_url TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS setup_media (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES setup_posts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('picture', 'attachment')),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size INT NOT NULL,
    object_key TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS setup_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES setup_posts(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    from_user TEXT NOT NULL REFERENCES users(username),
    to_users TEXT[] NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    read_by TEXT[] NOT NULL DEFAULT '{}',
    deleted_by TEXT[] NOT NULL DEFAULT '{}'
  )`,
  `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES organizations(id) ON DELETE CASCADE`,
  `ALTER TABLE share_listings ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES organizations(id) ON DELETE CASCADE`,
  `ALTER TABLE setup_posts ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES organizations(id) ON DELETE CASCADE`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES organizations(id) ON DELETE CASCADE`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS team_id TEXT`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS team_name TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS room_ideas (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username),
    year INT NOT NULL,
    publisher_id TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    source_key TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS room_idea_images (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES room_ideas(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
  )`,
  `UPDATE users SET platform_admin = TRUE WHERE username = 'admin'`,
  `CREATE TABLE IF NOT EXISTS vbs_plans (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    year INT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    publisher_id TEXT NOT NULL DEFAULT '',
    program_title TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    start_date DATE,
    end_date DATE,
    daily_start TEXT NOT NULL DEFAULT '09:00',
    daily_end TEXT NOT NULL DEFAULT '12:00',
    expected_kids INT NOT NULL DEFAULT 0,
    coordinator_notes TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS vbs_default_year INT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS vbs_default_publisher_id TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS vbs_default_program_title TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS vbs_default_all_filters BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ALTER COLUMN vbs_default_all_filters SET DEFAULT TRUE`,
  `ALTER TABLE vbs_plans ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(12, 2) NOT NULL DEFAULT 0`,
  `ALTER TABLE vbs_plans ADD COLUMN IF NOT EXISTS expenses_amount NUMERIC(12, 2) NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS schema_data_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS notify_sms BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS vbs_calendar_default_view TEXT NOT NULL DEFAULT 'week'`,
  `CREATE TABLE IF NOT EXISTS vbs_calendar_reminders (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('task', 'schedule', 'plan_start', 'plan_end')),
    item_id TEXT NOT NULL,
    minutes_before INT NOT NULL CHECK (minutes_before > 0),
    notify_email BOOLEAN NOT NULL DEFAULT TRUE,
    notify_sms BOOLEAN NOT NULL DEFAULT FALSE,
    fired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, username, item_type, item_id, minutes_before)
  )`,
  `CREATE INDEX IF NOT EXISTS vbs_calendar_reminders_user ON vbs_calendar_reminders (organization_id, username)`,
  `CREATE TABLE IF NOT EXISTS vbs_tasks (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES vbs_plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'planning',
    status TEXT NOT NULL DEFAULT 'todo',
    due_date DATE,
    assigned_username TEXT REFERENCES users(username),
    assigned_team_id TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `ALTER TABLE vbs_tasks ADD COLUMN IF NOT EXISTS expense_amount NUMERIC(12, 2) NOT NULL DEFAULT 0`,
  `ALTER TABLE vbs_tasks ADD COLUMN IF NOT EXISTS reimbursement_status TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE vbs_tasks ADD COLUMN IF NOT EXISTS reimbursement_archived BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE vbs_tasks ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS vbs_task_attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES vbs_tasks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '',
    size INT NOT NULL DEFAULT 0,
    object_key TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS vbs_task_attachments_task ON vbs_task_attachments (task_id)`,
  `CREATE TABLE IF NOT EXISTS vbs_stations (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES vbs_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    default_team_id TEXT,
    sort_order INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS vbs_schedule_slots (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES vbs_plans(id) ON DELETE CASCADE,
    day_date DATE NOT NULL,
    starts_at TEXT NOT NULL DEFAULT '09:00',
    ends_at TEXT NOT NULL DEFAULT '09:30',
    label TEXT NOT NULL,
    station_id TEXT REFERENCES vbs_stations(id) ON DELETE SET NULL,
    team_id TEXT,
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS vbs_checklist_items (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES vbs_plans(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'General',
    label TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_team_id TEXT,
    sort_order INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS vbs_board_posts (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES vbs_plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL,
    team_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS vbs_board_replies (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES vbs_board_posts(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS vbs_board_replies_post ON vbs_board_replies (post_id, created_at)`,
  `ALTER TABLE vbs_calendar_reminders DROP CONSTRAINT IF EXISTS vbs_calendar_reminders_item_type_check`,
  `ALTER TABLE vbs_calendar_reminders ADD CONSTRAINT vbs_calendar_reminders_item_type_check
     CHECK (item_type IN ('task', 'schedule', 'checklist', 'plan_start', 'plan_end', 'prayer'))`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS notify_board_in_app BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS notify_board_email BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS notify_board_sms BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS board_subscribe_org BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE vbs_checklist_items ADD COLUMN IF NOT EXISTS due_date DATE`,
  `ALTER TABLE vbs_checklist_items ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS vbs_schedule_activity_labels (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (organization_id, label)
  )`,
  `ALTER TABLE vbs_plans ADD COLUMN IF NOT EXISTS worksheet_data JSONB NOT NULL DEFAULT '{}'`,
  `CREATE TABLE IF NOT EXISTS vbs_board_team_subscriptions (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    team_id TEXT NOT NULL,
    PRIMARY KEY (organization_id, username, team_id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_board_mutes (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    muted_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    PRIMARY KEY (organization_id, username, muted_username)
  )`,
  `UPDATE org_teams SET name = 'Building Team' WHERE LOWER(TRIM(name)) = 'building team 2027'`,
  `UPDATE messages SET team_name = 'Building Team' WHERE LOWER(TRIM(team_name)) = 'building team 2027'`,
  `UPDATE vbs_plans SET title = 'Building Team' WHERE LOWER(TRIM(title)) = 'building team 2027'`,
  `ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check`,
  `ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
     CHECK (role IN ('org_admin', 'registration_admin', 'org_team_admin', 'org_write', 'org_read'))`,
  `CREATE TABLE IF NOT EXISTS org_team_admin_assignments (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES org_teams(id) ON DELETE CASCADE,
    PRIMARY KEY (organization_id, username, team_id)
  )`,
  `ALTER TABLE org_teams ADD COLUMN IF NOT EXISTS team_admin_username TEXT REFERENCES users(username)`,
  `UPDATE org_teams t SET team_admin_username = sub.username
   FROM (
     SELECT DISTINCT ON (team_id) organization_id, team_id, username
     FROM org_team_admin_assignments
     ORDER BY team_id, username
   ) sub
   WHERE t.id = sub.team_id AND t.organization_id = sub.organization_id AND t.team_admin_username IS NULL`,
  `CREATE TABLE IF NOT EXISTS photoshoppe_entries (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES photoshoppe_entries(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('folder', 'document')),
    name TEXT NOT NULL,
    snapshot_key TEXT NOT NULL DEFAULT '',
    preview_key TEXT NOT NULL DEFAULT '',
    updated_by TEXT REFERENCES users(username),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS photoshoppe_entries_folder_name
     ON photoshoppe_entries (organization_id, COALESCE(parent_id, ''), lower(trim(name)))
     WHERE kind = 'folder'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS photoshoppe_entries_document_name
     ON photoshoppe_entries (organization_id, COALESCE(parent_id, ''), lower(trim(name)))
     WHERE kind = 'document'`,
  `ALTER TABLE vbs_checklist_items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'not_started'`,
  `UPDATE vbs_checklist_items SET status = 'done' WHERE done = TRUE`,
  `UPDATE vbs_checklist_items SET status = 'not_started' WHERE done = FALSE AND (status IS NULL OR status = '')`,
  `ALTER TABLE vbs_checklist_items DROP CONSTRAINT IF EXISTS vbs_checklist_items_status_check`,
  `ALTER TABLE vbs_checklist_items ADD CONSTRAINT vbs_checklist_items_status_check
     CHECK (status IN ('not_started', 'in_progress', 'done'))`,
  `CREATE TABLE IF NOT EXISTS vbs_registrations (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    child_full_name TEXT NOT NULL,
    birth_month INT NOT NULL CHECK (birth_month >= 1 AND birth_month <= 12),
    birth_year INT NOT NULL CHECK (birth_year >= 1990 AND birth_year <= 2100),
    allergies_common TEXT[] NOT NULL DEFAULT '{}',
    allergies_other TEXT NOT NULL DEFAULT '',
    comments TEXT NOT NULL DEFAULT '',
    special_requests TEXT NOT NULL DEFAULT '',
    contact1_name TEXT NOT NULL DEFAULT '',
    contact1_phone TEXT NOT NULL DEFAULT '',
    contact2_name TEXT NOT NULL DEFAULT '',
    contact2_phone TEXT NOT NULL DEFAULT '',
    attend_mon BOOLEAN NOT NULL DEFAULT FALSE,
    attend_tue BOOLEAN NOT NULL DEFAULT FALSE,
    attend_wed BOOLEAN NOT NULL DEFAULT FALSE,
    attend_thu BOOLEAN NOT NULL DEFAULT FALSE,
    attend_fri BOOLEAN NOT NULL DEFAULT FALSE,
    tshirt_size TEXT NOT NULL DEFAULT '',
    assigned_team_id TEXT,
    nametag_image_key TEXT NOT NULL DEFAULT '',
    nametag_extra_instructions TEXT NOT NULL DEFAULT '',
    created_by TEXT REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS vbs_registrations_org ON vbs_registrations (organization_id, updated_at DESC)`,
  `ALTER TABLE vbs_registrations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'staff'`,
  `ALTER TABLE vbs_registrations DROP CONSTRAINT IF EXISTS vbs_registrations_source_check`,
  `ALTER TABLE vbs_registrations ADD CONSTRAINT vbs_registrations_source_check
     CHECK (source IN ('staff', 'public'))`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS public_registration_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS public_registration_token TEXT NOT NULL DEFAULT ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS organizations_public_registration_token_unique
     ON organizations (public_registration_token) WHERE public_registration_token <> ''`,
  `CREATE TABLE IF NOT EXISTS vbs_registration_classes (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_age INT NOT NULL DEFAULT 0,
    max_age INT NOT NULL DEFAULT 12,
    capacity_max INT NOT NULL DEFAULT 0,
    registration_closed BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS vbs_registration_classes_org ON vbs_registration_classes (organization_id, sort_order)`,
  `CREATE TABLE IF NOT EXISTS vbs_registration_class_staff (
    class_id TEXT NOT NULL REFERENCES vbs_registration_classes(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username),
    role TEXT NOT NULL CHECK (role IN ('leader', 'teacher', 'helper')),
    PRIMARY KEY (class_id, username)
  )`,
  `ALTER TABLE vbs_registration_class_staff DROP CONSTRAINT IF EXISTS vbs_registration_class_staff_role_check`,
  `ALTER TABLE vbs_registration_class_staff ADD CONSTRAINT vbs_registration_class_staff_role_check
     CHECK (role IN ('leader', 'teacher', 'helper'))`,
  `ALTER TABLE vbs_registration_class_staff ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS vbs_registration_class_students (
    class_id TEXT NOT NULL REFERENCES vbs_registration_classes(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES vbs_registrations(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (class_id, student_id)
  )`,
  `INSERT INTO vbs_registration_class_students (class_id, student_id, sort_order)
     SELECT class_id, id, class_roster_sort FROM vbs_registrations
     WHERE class_id IS NOT NULL
     ON CONFLICT DO NOTHING`,
  `ALTER TABLE vbs_registrations ADD COLUMN IF NOT EXISTS class_roster_sort INT NOT NULL DEFAULT 0`,
  `ALTER TABLE vbs_registration_classes ADD COLUMN IF NOT EXISTS board_order INT NOT NULL DEFAULT 0`,
  `ALTER TABLE vbs_registration_classes ADD COLUMN IF NOT EXISTS capacity_warn_notified_count INT NOT NULL DEFAULT 0`,
  `ALTER TABLE vbs_registration_classes ADD COLUMN IF NOT EXISTS rotation_index INT`,
  `ALTER TABLE vbs_registration_classes ADD COLUMN IF NOT EXISTS section_label TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE vbs_registrations ADD COLUMN IF NOT EXISTS class_id TEXT REFERENCES vbs_registration_classes(id) ON DELETE SET NULL`,
  `ALTER TABLE vbs_registrations ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE vbs_registrations DROP CONSTRAINT IF EXISTS vbs_registrations_payment_status_check`,
  `ALTER TABLE vbs_registrations ADD CONSTRAINT vbs_registrations_payment_status_check
     CHECK (payment_status IN ('pending', 'paid', 'waived'))`,
  `ALTER TABLE vbs_registrations ADD COLUMN IF NOT EXISTS child_gender TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE vbs_registrations DROP CONSTRAINT IF EXISTS vbs_registrations_child_gender_check`,
  `ALTER TABLE vbs_registrations ADD CONSTRAINT vbs_registrations_child_gender_check
     CHECK (child_gender IN ('', 'M', 'F'))`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cooking_team_id TEXT REFERENCES org_teams(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS vbs_registration_snacks_menu (
    organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    extra_instructions TEXT NOT NULL DEFAULT '',
    menu_text TEXT NOT NULL DEFAULT '',
    menu_json TEXT NOT NULL DEFAULT '',
    updated_by TEXT REFERENCES users(username),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE vbs_registration_snacks_menu ADD COLUMN IF NOT EXISTS menu_json TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE vbs_schedule_slots ADD COLUMN IF NOT EXISTS role_label TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE vbs_schedule_slots ADD COLUMN IF NOT EXISTS assigned_username TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE vbs_plans ADD COLUMN IF NOT EXISTS family_public_notes TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS public_family_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS public_family_token TEXT NOT NULL DEFAULT ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS organizations_public_family_token_unique
     ON organizations (public_family_token) WHERE public_family_token <> ''`,
  `CREATE TABLE IF NOT EXISTS vbs_supply_items (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES vbs_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity TEXT NOT NULL DEFAULT '',
    estimated_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    purchased BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_team_id TEXT,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS vbs_supply_items_plan ON vbs_supply_items (plan_id, sort_order, name)`,
  `ALTER TABLE vbs_registrations ADD COLUMN IF NOT EXISTS contact1_email TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE vbs_registrations ADD COLUMN IF NOT EXISTS contact2_email TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS active_vbs_year INT`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS vbs_season_year INT`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ`,
  `ALTER TABLE vbs_registrations ADD COLUMN IF NOT EXISTS vbs_season_year INT`,
  `UPDATE organizations o SET active_vbs_year = p.year FROM vbs_plans p WHERE p.organization_id = o.id AND o.active_vbs_year IS NULL`,
  `UPDATE organization_members m SET vbs_season_year = COALESCE(o.active_vbs_year, p.year, 2026)
     FROM organizations o
     LEFT JOIN vbs_plans p ON p.organization_id = o.id
     WHERE m.organization_id = o.id AND m.vbs_season_year IS NULL`,
  `UPDATE vbs_registrations r SET vbs_season_year = COALESCE(o.active_vbs_year, p.year, 2026)
     FROM organizations o
     LEFT JOIN vbs_plans p ON p.organization_id = o.id
     WHERE r.organization_id = o.id AND r.vbs_season_year IS NULL`,
  `ALTER TABLE vbs_registration_classes ADD COLUMN IF NOT EXISTS vbs_season_year INT`,
  `UPDATE vbs_registration_classes c SET vbs_season_year = COALESCE(o.active_vbs_year, p.year, 2026)
     FROM organizations o
     LEFT JOIN vbs_plans p ON p.organization_id = o.id
     WHERE c.organization_id = o.id AND c.vbs_season_year IS NULL`,
  `ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS background_check_status TEXT NOT NULL DEFAULT 'not_started'`,
  `ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_background_check_status_check`,
  `ALTER TABLE organization_members ADD CONSTRAINT organization_members_background_check_status_check
     CHECK (background_check_status IN ('not_started', 'pending', 'cleared'))`,
  `CREATE TABLE IF NOT EXISTS org_vbs_season_snapshots (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    season_year INT NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, season_year)
  )`,
];

const TEAM_NAME_UNIQUE_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS org_teams_org_name_unique
   ON org_teams (organization_id, LOWER(TRIM(name)))`;

export async function applySchema() {
  for (const sql of statements) {
    await db().query(sql);
  }
  const { dedupeOrgTeamsByName } = await import("../teams.js");
  const orgs = await db().query<{ id: string }>("SELECT id FROM organizations");
  for (const row of orgs.rows) {
    await dedupeOrgTeamsByName(row.id);
  }
  await db().query(TEAM_NAME_UNIQUE_INDEX);
  const { migrateAllUsersToBrowseAllVbsDefault } = await import("../user-vbs.js");
  await migrateAllUsersToBrowseAllVbsDefault();
  const { runDataCleanup } = await import("./cleanup.js");
  await runDataCleanup();
}
