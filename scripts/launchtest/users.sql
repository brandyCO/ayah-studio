-- Launch test: lets a few seeded test players sign in with a password (staging only), so the real sign-in path is
-- measured too. The rest of the virtual players use tokens signed with the staging project's own key.
\set ON_ERROR_STOP on
update auth.users set
  instance_id = '00000000-0000-0000-0000-000000000000', aud = 'authenticated', role = 'authenticated',
  encrypted_password = extensions.crypt(:'pw', extensions.gen_salt('bf', 4)),
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"email","providers":["email"]}', raw_user_meta_data = '{}',
  updated_at = now()
where id::text like '00000000-0000-0000-0000-%' and right(id::text, 12)::int <= :signins;
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
  from auth.users u
  where u.id::text like '00000000-0000-0000-0000-%' and right(u.id::text, 12)::int <= :signins
  on conflict do nothing;
