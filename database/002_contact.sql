begin;
create table if not exists contact_submissions (
 id uuid primary key default gen_random_uuid(),
 request_id uuid unique,
 name text not null check(length(trim(name)) between 1 and 150),
 email text not null check(length(email) between 3 and 254),
 subject text not null default '' check(length(subject)<=200),
 message text not null check(length(trim(message)) between 1 and 10000),
 created_at timestamptz not null default now()
);
create index if not exists contact_submissions_created on contact_submissions(created_at desc,id desc);
commit;
