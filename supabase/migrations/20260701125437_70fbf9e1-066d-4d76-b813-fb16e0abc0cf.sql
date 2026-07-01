create or replace function public.find_documents_by_title(search_term text)
returns table (document_id uuid, title text)
language sql
stable
security invoker
as $$
  select d.id, d.title
  from public.documents d
  where d.title ilike '%' || search_term || '%';
$$;

grant execute on function public.find_documents_by_title(text) to authenticated;