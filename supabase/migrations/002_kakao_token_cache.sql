-- 카카오 OAuth 토큰 (나에게 보내기 전용, 싱글 사용자 모델)
-- 비즈니스 인증 없이 쓸 수 있도록 Supabase Auth 우회하고 직접 OAuth
create table if not exists kakao_service_token (
  id int primary key default 1,
  access_token text not null,
  refresh_token text,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  kakao_user_id text,
  scopes text,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

alter table kakao_service_token enable row level security;
