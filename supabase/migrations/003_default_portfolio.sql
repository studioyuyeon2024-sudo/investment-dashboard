-- 단일 사용자 MVP용: portfolios.user_id 를 nullable 로 완화하고 default 포트폴리오 생성.
-- 향후 다중 사용자로 확장 시 user_id 를 auth.uid() 로 채우면 된다.

alter table portfolios alter column user_id drop not null;

insert into portfolios (id, user_id, name)
values ('00000000-0000-0000-0000-000000000001', null, '내 포트폴리오')
on conflict (id) do nothing;

-- RLS: service_role 은 우회하지만 anon 키로 접근 가능하게 하려면 정책 필요.
-- 지금은 서버에서만 접근하므로 policy 추가 불필요. (기존 "own portfolios" 정책은 auth.uid() 조건이라 익명 차단됨 → 의도대로)
