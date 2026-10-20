-- ════════════════════════════════════════════════════════════════════════════════════════
-- VIGA — Orçamentos: revisões da proposta (REV00, REV01, ...)
-- Só adiciona campos; nada existente é alterado. Supabase → SQL Editor → colar tudo → Run.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- O orçamento "vigente" guarda a revisão atual (revisao) e o que mudou nela (revisao_motivo);
-- as revisões anteriores ficam guardadas como cópias somente-leitura apontando para ele (revisao_de).
alter table public.orcamentos
  add column if not exists revisao integer not null default 0,
  add column if not exists revisao_motivo text,
  add column if not exists revisao_data timestamptz,
  add column if not exists revisao_de uuid references public.orcamentos(id) on delete cascade;

create index if not exists orcamentos_revisao_de_idx on public.orcamentos(revisao_de);
