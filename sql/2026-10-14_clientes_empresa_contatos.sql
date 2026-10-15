-- Clientes que são empresas: dados da empresa + vários contatos, e o "responsável" de cada documento
-- (já aplicado no Supabase como migration clientes_empresa_contatos_e_responsavel_documentos)

alter table public.clientes add column if not exists razao_social text, add column if not exists site text;

create table if not exists public.cliente_contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  cargo text,
  telefone text,
  email text,
  principal boolean not null default false,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists cliente_contatos_cliente_idx on public.cliente_contatos(cliente_id);
alter table public.cliente_contatos enable row level security;
create policy allow_all on public.cliente_contatos for all using (true) with check (true);

-- responsável (contato da empresa) específico de cada documento
alter table public.orcamentos   add column if not exists cliente_id uuid references public.clientes(id) on delete set null, add column if not exists contato_id uuid references public.cliente_contatos(id) on delete set null, add column if not exists contato_nome text;
alter table public.levantamentos add column if not exists contato_id uuid references public.cliente_contatos(id) on delete set null, add column if not exists contato_nome text;
alter table public.obras         add column if not exists cliente_id uuid references public.clientes(id) on delete set null, add column if not exists contato_id uuid references public.cliente_contatos(id) on delete set null, add column if not exists contato_nome text;
