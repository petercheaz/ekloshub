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
    role TEXT NOT NULL CHECK (role IN ('org_admin', 'org_write', 'org_read')),
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
  `CREATE TABLE IF NOT EXISTS vbs_announcements (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES vbs_plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL,
    notify_email BOOLEAN NOT NULL DEFAULT TRUE,
    notify_sms BOOLEAN NOT NULL DEFAULT FALSE,
    team_id TEXT
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
  `INSERT INTO vbs_board_posts (id, plan_id, title, body, created_by, created_at, team_id)
   SELECT a.id, a.plan_id, a.title, a.body, a.created_by, a.created_at, a.team_id
   FROM vbs_announcements a
   WHERE NOT EXISTS (SELECT 1 FROM vbs_board_posts p WHERE p.id = a.id)`,
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
}
