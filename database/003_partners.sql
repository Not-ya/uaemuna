begin;
create table if not exists site_settings(key text primary key,value jsonb not null default '{}');
create table if not exists partners(
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 100),
 description text not null default '' check(length(description)<=1500),
 website text not null check(length(website)<=2000),
 banner_path text,
 banner_data bytea,
 banner_type text check(banner_type in ('image/png','image/jpeg','image/webp')),
 banner_version uuid not null default gen_random_uuid(),
 published boolean not null default true,
 position integer not null default 0 check(position between 0 and 10000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
with first_seed as (
 insert into site_settings(key,value) values('partners_seeded','{"complete":true}') on conflict do nothing returning key
)
insert into partners(name,description,website,banner_path,position)
select seed.* from first_seed cross join (values
 ('ValorMUN','A premier Model United Nations conference dedicated to fostering diplomatic excellence and global leadership.','https://valormun-dnl7epua.manus.space/','/images/valormun-banner.webp',0),
 ('AAIOMUN','Al Ain International Online MUN — bringing delegates together through online Model United Nations.','https://aaiomun2026-2huqjyfc.manus.space','/images/aaiomun-banner.webp',1)
) as seed(name,description,website,banner_path,position);
commit;
