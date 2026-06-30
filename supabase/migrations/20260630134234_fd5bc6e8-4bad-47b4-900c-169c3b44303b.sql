-- Document Q&A — database setup
-- Builds full-text search over the APPROVED (published_content) text of
-- document_sections, stored as TipTap rich-text JSON. All functions are
-- SECURITY INVOKER so existing RLS on documents/document_sections applies.

create or replace function public.tiptap_to_text(doc jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select string_agg(t, ' ')
      from jsonb_array_elements_text(
             jsonb_path_query_array(doc, 'strict $.**.text')
           ) as t
    ),
    ''
  );
$$;

create index if not exists document_sections_published_fts_idx
  on public.document_sections
  using gin (to_tsvector('danish', public.tiptap_to_text(published_content)));

create or replace function public.count_documents_containing(search_term text)
returns bigint
language sql
stable
security invoker
as $$
  select count(distinct d.id)
  from public.documents d
  join public.document_sections s on s.document_id = d.id
  where to_tsvector('danish', public.tiptap_to_text(s.published_content))
        @@ plainto_tsquery('danish', search_term);
$$;

create or replace function public.search_documents(search_term text)
returns table (document_id uuid, title text, matches bigint)
language sql
stable
security invoker
as $$
  select d.id, d.title, count(*) as matches
  from public.documents d
  join public.document_sections s on s.document_id = d.id
  where to_tsvector('danish', public.tiptap_to_text(s.published_content))
        @@ plainto_tsquery('danish', search_term)
  group by d.id, d.title
  order by matches desc;
$$;

create or replace function public.get_document_text(doc_id uuid)
returns table (title text, section_title text, body text)
language sql
stable
security invoker
as $$
  select d.title,
         coalesce(ts.name, 'Untitled section') as section_title,
         public.tiptap_to_text(s.published_content) as body
  from public.documents d
  join public.document_sections s on s.document_id = d.id
  left join public.template_sections ts on ts.id = s.template_section_id
  where d.id = doc_id
  order by ts.position nulls last;
$$;

grant execute on function public.count_documents_containing(text) to authenticated;
grant execute on function public.search_documents(text)          to authenticated;
grant execute on function public.get_document_text(uuid)         to authenticated;
