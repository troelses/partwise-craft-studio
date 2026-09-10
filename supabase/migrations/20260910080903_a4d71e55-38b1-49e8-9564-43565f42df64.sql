-- Inherit legacy per-document permissions when a version is created.
CREATE OR REPLACE FUNCTION public.create_document_version(
  p_source_document_id uuid,
  p_template_id        uuid,
  p_copy_content       boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source        public.documents%ROWTYPE;
  v_group         uuid;
  v_next          integer;
  v_new_id        uuid;
  v_same_template boolean;
  v_k             public.kerneopgaver%ROWTYPE;
  v_new_k_id      uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source FROM public.documents WHERE id = p_source_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source document % not found', p_source_document_id;
  END IF;

  v_group := v_source.version_group_id;

  IF NOT public.can_manage_document_versions(auth.uid(), v_group) THEN
    RAISE EXCEPTION 'Insufficient permissions to create a version of this document';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE id = p_template_id) THEN
    RAISE EXCEPTION 'Template % not found', p_template_id;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next
    FROM public.documents
   WHERE version_group_id = v_group;

  INSERT INTO public.documents (
    title, template_id, owner_id, team_lead_id,
    version_group_id, version_number, is_current,
    created_at, updated_at
  )
  VALUES (
    v_source.title, p_template_id, auth.uid(), v_source.team_lead_id,
    v_group, v_next, false,
    now(), now()
  )
  RETURNING id INTO v_new_id;

  -- Inherit the source version's grants. This also overwrites the 'approve'
  -- that on_document_created just handed the creator, pinning them to the level
  -- they actually hold on the source, so creating a version grants no authority.
  INSERT INTO public.document_access (document_id, user_id, permission, granted_by)
  SELECT v_new_id, da.user_id, da.permission, auth.uid()
    FROM public.document_access da
   WHERE da.document_id = p_source_document_id
  ON CONFLICT (document_id, user_id)
  DO UPDATE SET permission = EXCLUDED.permission,
                updated_at = now();

  -- Inherit the legacy user_permissions rows as well.
  --
  -- This is not belt-and-braces: the kerneopgaver policies still grant write
  -- access through user_permissions.can_edit and know nothing about
  -- document_access.
  INSERT INTO public.user_permissions (
    user_id, document_id, section_id, can_view, can_edit
  )
  SELECT up.user_id, v_new_id::text, up.section_id, up.can_view, up.can_edit
    FROM public.user_permissions up
   WHERE up.document_id = p_source_document_id::text
  ON CONFLICT (user_id, document_id, section_id) DO NOTHING;

  v_same_template := (v_source.template_id IS NOT DISTINCT FROM p_template_id);

  IF p_copy_content AND v_same_template THEN
    INSERT INTO public.document_sections (
      document_id, template_section_id, content, draft_content, updated_at
    )
    SELECT v_new_id, ds.template_section_id, ds.content,
           COALESCE(ds.draft_content, ds.published_content), now()
      FROM public.document_sections ds
     WHERE ds.document_id = p_source_document_id;
  END IF;

  IF p_copy_content AND EXISTS (
        SELECT 1
          FROM public.template_sections ts
         WHERE ts.template_id = p_template_id
           AND ts.section_key = 'kerneopgaver'
     ) THEN
    FOR v_k IN
      SELECT * FROM public.kerneopgaver
       WHERE document_id = p_source_document_id
       ORDER BY position
    LOOP
      INSERT INTO public.kerneopgaver (document_id, title, position)
      VALUES (v_new_id, v_k.title, v_k.position)
      RETURNING id INTO v_new_k_id;

      INSERT INTO public.kerneopgave_sections (
        kerneopgave_id, section_type, draft_content, updated_at
      )
      SELECT v_new_k_id, ks.section_type, ks.draft_content, now()
        FROM public.kerneopgave_sections ks
       WHERE ks.kerneopgave_id = v_k.id;
    END LOOP;
  END IF;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_document_version(uuid, uuid, boolean) TO authenticated;