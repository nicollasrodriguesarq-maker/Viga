-- ════════════════════════════════════════════════════════════════════════════════════════
-- VIGA — Agenda com participantes (convites, aceite/recusa) e link de reunião
-- Só adiciona; nada existente é alterado. Supabase → SQL Editor → colar tudo → Run.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter table public.agenda_compromissos add column if not exists link_reuniao text;

create table if not exists public.agenda_participantes (
  id uuid primary key default gen_random_uuid(),
  compromisso_id uuid not null references public.agenda_compromissos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'recusado')),
  respondido_em timestamptz,
  created_at timestamptz not null default now(),
  unique (compromisso_id, usuario_id)
);
create index if not exists agenda_participantes_usuario_idx on public.agenda_participantes(usuario_id);
create index if not exists agenda_participantes_compromisso_idx on public.agenda_participantes(compromisso_id);

-- mesmo nível de acesso do restante da agenda: só usuário logado e aprovado
alter table public.agenda_participantes enable row level security;
drop policy if exists staff_all on public.agenda_participantes;
create policy staff_all on public.agenda_participantes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
revoke all on public.agenda_participantes from anon;
grant select, insert, update, delete on public.agenda_participantes to authenticated;
