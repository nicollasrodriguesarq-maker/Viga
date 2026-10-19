-- Já aplicado no banco (migration seguranca_01). Guardado aqui para recriar o banco, se preciso.

-- Usuário criado por cadastro público nasce NÃO aprovado e não enxerga nada. Quem já existe é aprovado.
alter table public.usuarios add column if not exists aprovado boolean not null default false;
update public.usuarios set aprovado = true;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.aprovado)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.aprovado and u.role = 'admin')
$$;

create or replace function public.has_module(m text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.aprovado
      and (u.role = 'admin' or m = any (coalesce(u.modulos_permitidos, '{}'::text[])))
  )
$$;

-- O token do feed de agenda é segredo de cada usuário: só sai por esta função.
create or replace function public.meu_feed_token() returns text
language sql stable security definer set search_path = public as $$
  select u.feed_token::text from public.usuarios u where u.id = auth.uid() and u.aprovado
$$;

revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.has_module(text) from public, anon;
revoke execute on function public.meu_feed_token() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_module(text) to authenticated;
grant execute on function public.meu_feed_token() to authenticated;

-- Função de trigger: não precisa ser chamável pela API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

