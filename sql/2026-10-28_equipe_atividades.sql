-- ════════════════════════════════════════════════════════════════════════════════════════
-- VIGA — Equipes: atividades diárias (responsáveis, prazo, anexos, alertas)
-- Só adiciona; nada existente é alterado. Supabase → SQL Editor → colar tudo → Run.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- Quem pode criar/editar atividades: admin e gerente de time
create or replace function public.is_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.aprovado and u.role in ('admin', 'gerente_time'))
$$;
revoke execute on function public.is_gestor() from public, anon;
grant execute on function public.is_gestor() to authenticated;

-- Tipos de atividade (a equipe pode criar novos); cada tipo traz o aviso padrão de "faltam X dias"
create table if not exists public.equipe_atividade_tipos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  alerta_dias integer not null default 1 check (alerta_dias between 0 and 30),
  created_at timestamptz not null default now()
);
insert into public.equipe_atividade_tipos (nome, alerta_dias) values
  ('Obra / Execução', 1), ('Visita técnica', 1), ('Projeto', 2), ('Orçamento / Proposta', 2),
  ('Comercial / Cliente', 1), ('Financeiro', 2), ('Compras / Fornecedores', 2), ('Administrativo', 2), ('Outro', 1)
on conflict (nome) do nothing;

create table if not exists public.equipe_atividades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  tipo text not null default 'Outro',
  data_inicio date not null,
  data_fim date not null,
  alerta_dias integer not null default 1 check (alerta_dias between 0 and 30),   -- avisa quando faltarem X dias para o término
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_fim >= data_inicio)
);
create index if not exists equipe_atividades_fim_idx on public.equipe_atividades(data_fim);

-- Cada responsável acompanha e conclui a sua parte
create table if not exists public.equipe_atividade_responsaveis (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid not null references public.equipe_atividades(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluida')),
  concluido_em timestamptz,
  updated_at timestamptz not null default now(),
  unique (atividade_id, usuario_id)
);
create index if not exists equipe_ativ_resp_usuario_idx on public.equipe_atividade_responsaveis(usuario_id);
create index if not exists equipe_ativ_resp_ativ_idx on public.equipe_atividade_responsaveis(atividade_id);

-- Andamento: comentários e mudanças de status
create table if not exists public.equipe_atividade_notas (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid not null references public.equipe_atividades(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  tipo text not null default 'nota' check (tipo in ('nota', 'status')),
  texto text not null,
  created_at timestamptz not null default now()
);
create index if not exists equipe_ativ_notas_ativ_idx on public.equipe_atividade_notas(atividade_id);

create table if not exists public.equipe_atividade_anexos (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid not null references public.equipe_atividades(id) on delete cascade,
  nome text not null,
  caminho text not null,                 -- caminho dentro do bucket equipe-atividades
  tamanho bigint,
  mime text,
  enviado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists equipe_ativ_anexos_ativ_idx on public.equipe_atividade_anexos(atividade_id);

-- ── Permissões (RLS) ──────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['equipe_atividade_tipos', 'equipe_atividades', 'equipe_atividade_responsaveis', 'equipe_atividade_notas', 'equipe_atividade_anexos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists staff_ler on public.%I', t);
    execute format('create policy staff_ler on public.%I for select to authenticated using (public.is_staff())', t);
  end loop;
end $$;

-- tipos e atividades: só admin/gerente gravam
drop policy if exists gestor_escreve on public.equipe_atividade_tipos;
create policy gestor_escreve on public.equipe_atividade_tipos for all to authenticated using (public.is_gestor()) with check (public.is_gestor());
drop policy if exists gestor_escreve on public.equipe_atividades;
create policy gestor_escreve on public.equipe_atividades for all to authenticated using (public.is_gestor()) with check (public.is_gestor());

-- responsáveis: o gestor monta a lista; cada pessoa atualiza só o próprio status
drop policy if exists gestor_insere on public.equipe_atividade_responsaveis;
create policy gestor_insere on public.equipe_atividade_responsaveis for insert to authenticated with check (public.is_gestor());
drop policy if exists gestor_remove on public.equipe_atividade_responsaveis;
create policy gestor_remove on public.equipe_atividade_responsaveis for delete to authenticated using (public.is_gestor());
drop policy if exists proprio_atualiza on public.equipe_atividade_responsaveis;
create policy proprio_atualiza on public.equipe_atividade_responsaveis for update to authenticated
  using (usuario_id = auth.uid() or public.is_gestor()) with check (usuario_id = auth.uid() or public.is_gestor());

-- notas: qualquer pessoa registra a própria; só gestor apaga
drop policy if exists staff_escreve_nota on public.equipe_atividade_notas;
create policy staff_escreve_nota on public.equipe_atividade_notas for insert to authenticated with check (public.is_staff() and usuario_id = auth.uid());
drop policy if exists gestor_apaga_nota on public.equipe_atividade_notas;
create policy gestor_apaga_nota on public.equipe_atividade_notas for delete to authenticated using (public.is_gestor());

-- anexos: qualquer pessoa envia; apaga quem enviou ou o gestor
drop policy if exists staff_envia_anexo on public.equipe_atividade_anexos;
create policy staff_envia_anexo on public.equipe_atividade_anexos for insert to authenticated with check (public.is_staff() and enviado_por = auth.uid());
drop policy if exists apaga_anexo on public.equipe_atividade_anexos;
create policy apaga_anexo on public.equipe_atividade_anexos for delete to authenticated using (enviado_por = auth.uid() or public.is_gestor());

-- ── Arquivos anexados (bucket privado, abre por link assinado) ────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('equipe-atividades', 'equipe-atividades', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists storage_equipe_atividades on storage.objects;
create policy storage_equipe_atividades on storage.objects for all to authenticated
  using (bucket_id = 'equipe-atividades' and public.is_staff())
  with check (bucket_id = 'equipe-atividades' and public.is_staff());
