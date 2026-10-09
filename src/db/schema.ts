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
];

export async function applySchema() {
  for (const sql of statements) {
    await db().query(sql);
  }
}
