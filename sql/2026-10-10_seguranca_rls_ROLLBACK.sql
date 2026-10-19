-- ROLLBACK DE EMERGÊNCIA: devolve o acesso aberto anterior (só usar se o app quebrar após o trancamento)
do $$
declare r record; t text;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname in ('public','storage')
  loop execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
  for t in select tablename from pg_tables where schemaname='public' and tablename <> 'obra_cliente_acessos' loop
    execute format('create policy allow_all on public.%I for all to public using (true) with check (true)', t);
  end loop;
end $$;
grant all on all tables in schema public to anon;
grant select on public.usuarios to authenticated;
update storage.buckets set public = true where id in ('notas-fiscais','obra-funcionarios-arquivos','levantamento-arquivos');
create policy allow_all_storage on storage.objects for all to public using (true) with check (true);
