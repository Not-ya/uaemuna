begin;
create table if not exists outbound_emails (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references users(id),
 request_id uuid not null,
 recipient text not null check(length(recipient)<=254),
 subject text not null check(length(subject) between 1 and 200),
 body text not null check(length(trim(body)) between 1 and 10000),
 sender_name text not null,
 sender_title text not null,
 reply_to text not null,
 status text not null check(status in ('sending','sent','failed','uncertain')),
 provider_message_id text,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(sender_id,request_id)
);
create index if not exists outbound_emails_sender_time on outbound_emails(sender_id,created_at desc);
commit;
