-- ════════════════════════════════════════════════════════════════════════════════════════
-- VIGA — CRM: Prospecção automatizada (fila do dia, cadência, editais, planilhas, Google Maps)
-- Só adiciona tabelas novas; nada existente é alterado. Supabase → SQL Editor → colar tudo → Run.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- Prospecto = contato ainda frio (ninguém pediu orçamento). Vira LEAD do pipeline quando responde com interesse.
create table if not exists public.crm_prospectos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  segmento text not null default 'outros',
  tipo_abordagem text not null default 'contato' check (tipo_abordagem in ('contato', 'edital')),
  fonte text not null default 'manual',          -- manual | importacao | pncp | google | receita | indicacao
  fonte_ref text,                                 -- id na origem (nº do edital, place_id, CNPJ...) — evita duplicar
  documento text,                                 -- CNPJ/CPF só dígitos
  telefone text,
  whatsapp text,
  email text,
  site text,
  instagram text,
  endereco text,
  bairro text,
  cidade text default 'São Paulo',
  uf text default 'SP',
  gatilho text,                                   -- por que este contato agora (edital aberto, empresa nova...)
  gatilho_data date,
  prazo date,                                     -- edital: último dia para proposta
  valor_estimado numeric,
  link_origem text,
  detalhes jsonb,
  score integer not null default 0,
  score_detalhe jsonb,
  status text not null default 'novo' check (status in ('novo', 'abordado', 'respondeu', 'lead', 'frio', 'descartado')),
  motivo_descarte text,
  tentativas integer not null default 0,
  ultimo_contato timestamptz,
  proximo_contato date,
  fila_data date,                                 -- dia em que entrou na fila de abordagem
  responsavel_id uuid references public.usuarios(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fonte, fonte_ref)
);
create index if not exists crm_prospectos_status_idx on public.crm_prospectos(status);
create index if not exists crm_prospectos_fila_idx on public.crm_prospectos(fila_data);
create index if not exists crm_prospectos_prox_idx on public.crm_prospectos(proximo_contato);
create index if not exists crm_prospectos_score_idx on public.crm_prospectos(score desc);

create table if not exists public.crm_prospeccao_atividades (
  id uuid primary key default gen_random_uuid(),
  prospecto_id uuid not null references public.crm_prospectos(id) on delete cascade,
  tipo text not null,                             -- abordagem | resposta | nota | status
  descricao text,
  usuario_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_prosp_ativ_idx on public.crm_prospeccao_atividades(prospecto_id);

-- Quem pediu para não ser contatado (LGPD): nunca volta a entrar nas listas
create table if not exists public.crm_bloqueios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('documento', 'telefone', 'email')),
  valor text not null,
  motivo text,
  created_at timestamptz not null default now(),
  unique (tipo, valor)
);

-- Configuração única (uma linha)
create table if not exists public.crm_prospeccao_config (
  id integer primary key default 1 check (id = 1),
  meta_diaria integer not null default 5,
  score_minimo integer not null default 55,
  cadencia_dias integer[] not null default '{3,7,14}',
  dias_reativacao integer not null default 90,
  municipios_ibge text[] not null default '{3550308}',      -- São Paulo (capital)
  bairros text[] not null default '{Pinheiros,Vila Mariana,Moema,Itaim Bibi,Tatuapé,Santana,Mooca,Perdizes,Lapa,Butantã,Santo Amaro,Vila Madalena}',
  palavras_incluir text[],
  palavras_excluir text[],
  valor_min_edital numeric not null default 20000,
  valor_max_edital numeric not null default 3000000,
  google_limite_mensal integer not null default 900,
  google_buscas_por_execucao integer not null default 5,
  google_consumo jsonb not null default '{}',               -- {"2026-10": 37}
  pncp_cursor jsonb not null default '{}',
  pncp_ultima_execucao timestamptz,
  google_cursor integer not null default 0,
  google_ultima_execucao timestamptz,
  ultima_fila date,
  templates jsonb,
  updated_at timestamptz not null default now()
);
insert into public.crm_prospeccao_config (id) values (1) on conflict (id) do nothing;

-- Acesso: só quem tem o módulo CRM (ou é admin). O servidor usa a chave de serviço para os robôs.
do $$
declare t text;
begin
  foreach t in array array['crm_prospectos', 'crm_prospeccao_atividades', 'crm_bloqueios', 'crm_prospeccao_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists modulo_crm on public.%I', t);
    execute format('create policy modulo_crm on public.%I for all to authenticated using (public.has_module(''crm'')) with check (public.has_module(''crm''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
