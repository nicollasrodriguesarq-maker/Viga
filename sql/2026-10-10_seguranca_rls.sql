-- ════════════════════════════════════════════════════════════════════════════════════════
-- VIGA — Trancamento do banco (RLS por usuário aprovado) + storage privado
-- Aplicar DEPOIS que o front com o interceptor de autenticação (app/lib/authFetch.ts) estiver
-- no ar. Pré-requisito já aplicado: sql "seguranca_01" (usuarios.aprovado + is_staff/is_admin/
-- has_module/meu_feed_token).
--
-- Antes: toda tabela tinha a policy "allow_all" para o papel público — qualquer pessoa com a
-- chave anon (que vai no JavaScript do site) lia e apagava tudo.
-- Depois: só usuário logado E aprovado acessa; o papel anon não acessa nada.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- 0. defesa em profundidade: o papel anon perde qualquer acesso direto às tabelas/funções
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

alter table public.orcamento_itens_composicao enable row level security;

-- 1. apaga TODAS as policies atuais das tabelas do app (incluindo as allow_all)
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 2. policies novas ---------------------------------------------------------------------
-- 2a. tabelas operacionais: qualquer usuário aprovado
do $$
declare t text;
begin
  foreach t in array array[
    'agenda_compromissos','banco_itens','banco_itens_composicao','cronograma_etapas','cronograma_historico',
    'levantamento_ambientes','levantamento_arquivos','levantamento_itens','levantamento_solicitacoes','levantamentos',
    'medicao_itens','medicoes','obra_atribuicoes','obra_relatorios_visita','obra_servicos','obras',
    'orcamento_ambientes','orcamento_itens','orcamento_itens_composicao','orcamento_solicitacoes','orcamentos'
  ] loop
    execute format('create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- 2b. financeiro (lançamentos, cartão, contas, investimentos): módulo financeiro ou obras (a tela de obra mostra custos)
do $$
declare t text;
begin
  foreach t in array array['lancamentos','gastos_cartao','contas','cartoes','investimentos'] loop
    execute format('create policy modulo_financeiro on public.%I for all to authenticated using (public.has_module(''financeiro'') or public.has_module(''obras'')) with check (public.has_module(''financeiro'') or public.has_module(''obras''))', t);
  end loop;
end $$;

-- 2c. dados pessoais de funcionários (CPF/RG e documentos): módulo obras
create policy modulo_obras on public.obra_funcionarios for all to authenticated using (public.has_module('obras')) with check (public.has_module('obras'));
create policy modulo_obras on public.obra_funcionario_arquivos for all to authenticated using (public.has_module('obras')) with check (public.has_module('obras'));

-- 2d. CRM e clientes: módulo crm; o Orçamento só LÊ os leads (para vincular)
create policy modulo_crm on public.crm_leads for all to authenticated using (public.has_module('crm')) with check (public.has_module('crm'));
create policy leitura_orcamento on public.crm_leads for select to authenticated using (public.has_module('orcamento'));
create policy modulo_crm on public.crm_atividades for all to authenticated using (public.has_module('crm')) with check (public.has_module('crm'));
create policy modulo_crm on public.clientes for all to authenticated using (public.has_module('crm')) with check (public.has_module('crm'));

-- 2e. configurações da empresa e times: todos leem, só admin altera
create policy leitura on public.empresa_config for select to authenticated using (public.is_staff());
create policy escrita_admin on public.empresa_config for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy leitura on public.empresa_contatos for select to authenticated using (public.is_staff());
create policy escrita_admin on public.empresa_contatos for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy leitura on public.times for select to authenticated using (public.is_staff());
create policy escrita_admin on public.times for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2f. usuários: aprovados leem; só admin altera (cria/exclui pelo servidor com service key);
--     ninguém além do servidor muda o próprio papel/módulos/aprovação.
create policy leitura on public.usuarios for select to authenticated using (public.is_staff());
create policy atualiza_admin on public.usuarios for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy exclui_admin on public.usuarios for delete to authenticated using (public.is_admin());
revoke select on public.usuarios from authenticated;
grant select (id, email, nome, role, created_at, setor, modulos_permitidos, modulos_app, time_id, aprovado) on public.usuarios to authenticated;
revoke insert on public.usuarios from authenticated;

-- 2g. anotações pessoais: só o próprio dono
create policy proprio on public.anotacoes_pessoais for all to authenticated using (public.is_staff() and usuario_id = auth.uid()) with check (public.is_staff() and usuario_id = auth.uid());

-- 2h. credenciais do portal do cliente: nunca pela API pública (só service key no servidor)
revoke all on public.obra_cliente_acessos from authenticated;

-- 3. STORAGE ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

-- documentos com dados pessoais/financeiros: bucket privado (acesso por URL assinada)
update storage.buckets set public = false where id in ('notas-fiscais', 'obra-funcionarios-arquivos', 'levantamento-arquivos');
update storage.buckets set file_size_limit = 26214400 where id in ('empresa-logo','levantamento-arquivos','levantamento-fotos','notas-fiscais','obra-funcionarios-arquivos','relatorio-visita-fotos');

-- leitura pública das fotos/logo continua pela URL pública do objeto (nome aleatório), mas sem
-- listagem e sem escrita anônima: gravar/alterar/apagar exige usuário aprovado.
create policy storage_fotos on storage.objects for all to authenticated
  using (bucket_id in ('levantamento-fotos','relatorio-visita-fotos','levantamento-arquivos') and public.is_staff())
  with check (bucket_id in ('levantamento-fotos','relatorio-visita-fotos','levantamento-arquivos') and public.is_staff());
create policy storage_logo_leitura on storage.objects for select to authenticated using (bucket_id = 'empresa-logo' and public.is_staff());
create policy storage_logo_escrita on storage.objects for all to authenticated using (bucket_id = 'empresa-logo' and public.is_admin()) with check (bucket_id = 'empresa-logo' and public.is_admin());
create policy storage_nf on storage.objects for all to authenticated
  using (bucket_id = 'notas-fiscais' and (public.has_module('financeiro') or public.has_module('obras')))
  with check (bucket_id = 'notas-fiscais' and (public.has_module('financeiro') or public.has_module('obras')));
create policy storage_func on storage.objects for all to authenticated
  using (bucket_id = 'obra-funcionarios-arquivos' and public.has_module('obras'))
  with check (bucket_id = 'obra-funcionarios-arquivos' and public.has_module('obras'));
