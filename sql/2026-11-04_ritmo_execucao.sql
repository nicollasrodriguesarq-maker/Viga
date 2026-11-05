-- ════════════════════════════════════════════════════════════════════════════════════════
-- VIGA — Ritmo de execução (prazo com serviços em paralelo)
-- Guarda o ritmo escolhido na proposta e na obra (sequencial | equilibrado | acelerado).
-- Só adiciona colunas; nada existente é alterado. Supabase → SQL Editor → colar tudo → Run.
-- ════════════════════════════════════════════════════════════════════════════════════════
alter table public.orcamentos add column if not exists ritmo_execucao text not null default 'equilibrado'
  check (ritmo_execucao in ('sequencial', 'equilibrado', 'acelerado'));
alter table public.obras add column if not exists ritmo_execucao text not null default 'equilibrado'
  check (ritmo_execucao in ('sequencial', 'equilibrado', 'acelerado'));
