begin;
create table if not exists users (
 id uuid primary key default gen_random_uuid(), email text unique not null check(email=lower(trim(email))),
 name text not null default '' check(length(name)<=80), password_hash text,
 role text not null check(role in ('owner','admin','executive','staff','volunteer','member')),
 active boolean not null default true, verified_at timestamptz, created_at timestamptz not null default now()
);
create unique index if not exists sole_owner on users(role) where role='owner';
create table if not exists invitations (
 email text primary key check(email=lower(trim(email))), role text not null check(role in ('owner','admin','executive','staff','volunteer','member')),
 invited_by uuid references users(id), expires_at timestamptz not null, accepted_at timestamptz, revoked boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists auth_tokens (
 hash text primary key, email text not null, purpose text not null check(purpose in ('activate','reset')), expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists auth_tokens_expiry on auth_tokens(expires_at);
create table if not exists sessions (
 id uuid primary key default gen_random_uuid(), hash text unique not null, user_id uuid not null references users(id) on delete cascade,
 csrf text not null, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists sessions_user on sessions(user_id);
create table if not exists rate_limits (key text primary key, count integer not null, reset_at timestamptz not null);
create table if not exists conversations (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('group','direct')), slug text unique, title text not null,
 direct_a uuid references users(id), direct_b uuid references users(id), created_at timestamptz not null default now(),
 check((kind='group' and slug in ('main','leadership','staff','volunteers') and direct_a is null and direct_b is null)
 or (kind='direct' and slug is null and direct_a is not null and direct_b is not null and direct_a<direct_b)), unique(direct_a,direct_b)
);
insert into conversations(kind,slug,title) values('group','main','Main'),('group','leadership','Big guns'),('group','staff','Staff'),('group','volunteers','Volunteers') on conflict(slug) do nothing;
create table if not exists messages (
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references conversations(id) on delete cascade,
 author_id uuid not null references users(id),body text not null check(length(trim(body)) between 1 and 4000),
 reply_to uuid references messages(id) on delete set null, created_at timestamptz not null default now(),edited_at timestamptz
);
create index if not exists messages_chat_time on messages(conversation_id,created_at desc,id desc);
create index if not exists messages_author_time on messages(author_id,created_at desc);
create table if not exists reactions (
 message_id uuid not null references messages(id) on delete cascade,user_id uuid not null references users(id),
 emoji text not null check(emoji in ('❤️','😂','🔥','👏','👍','😮')),primary key(message_id,user_id,emoji)
);
create table if not exists push_subscriptions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references users(id) on delete cascade,
 session_id uuid not null references sessions(id) on delete cascade,endpoint text unique not null,p256dh text not null,auth text not null,created_at timestamptz not null default now()
);
create table if not exists push_deliveries (
 message_id uuid not null references messages(id) on delete cascade,subscription_id uuid not null references push_subscriptions(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(message_id,subscription_id)
);
commit;
