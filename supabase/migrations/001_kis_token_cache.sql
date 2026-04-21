-- KIS OAuth 토큰 영구 캐시 (서비스 레벨, 싱글 로우)
-- KIS API는 1분당 1회 토큰 발급 제한이 있어 서버 재시작 시 rate limit 에 걸릴 수 있음.
-- 이 테이블로 프로세스 재시작에도 토큰을 재사용한다.
create table if not exists kis_service_token (
  id int primary key default 1,
  access_token text not null,
  expires_at timestamptz not null,
  environment text not null check (environment in ('paper', 'real')),
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

-- RLS: service_role만 접근 (anon 접근 금지 — access_token 은 민감)
alter table kis_service_token enable row level security;
