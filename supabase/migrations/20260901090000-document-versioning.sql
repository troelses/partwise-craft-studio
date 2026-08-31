-- Document versioning.
--
-- A "document" is now a group of versions sharing a version_group_id. Each
-- version is its own row in public.documents, owns its own document_sections
-- and kerneopgaver, and carries its own template_id — so a new version can be
-- built on a different template than the one before it.
--
-- Exactly one version per group is flagged is_current; that is the one listed
-- by default.
--
-- Idempotent: safe to re-run.

-- 1. Versioning columns -------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS version_group_id UUID,
  ADD COLUMN IF NOT EXISTS version_number   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current       BOOLEAN NOT NULL DEFAULT true;

-- Every pre-existing document becomes version 1 of its own group, and current.
UPDATE public.documents
   SET version_group_id = id
 WHERE version_group_id IS NULL;

ALTER TABLE public.documents
  ALTER COLUMN version_group_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.documents
  ALTER COLUMN version_group_id SET NOT NULL;

-- At most one current version per group.
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_current_version
  ON public.documents(version_group_id)
  WHERE is_current;

-- Version numbers are unique within a group.
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_version_number
  ON public.documents(version_group_id, version_number);

CREATE INDEX IF NOT EXISTS idx_documents_version_group
  ON public.documents(version_group_id);

-- 2. Permission helper --------------------------------------------------------
-- Version management is allowed for global admins, global editors, and the
-- team lead of any version in the group.
CREATE OR REPLACE FUNCTION public.can_manage_document_versions(
  p_user_id          uuid,
  p_version_group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      public.check_user_role(p_user_id, 'admin')
      OR public.check_user_role(p_user_id, 'editor')
      OR EXISTS (
        SELECT 1
          FROM public.documents d
         WHERE d.version_group_id = p_version_group_id
           AND d.team_lead_id     = p_user_id
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_document_versions(uuid, uuid) TO authenticated;

-- 3. Create a new version -----------------------------------------------------
-- Returns the id of the newly created version. The new version is NOT made
-- current automatically — promote it explicitly with
-- set_current_document_version.
--
-- Content is copied only when the new version uses the same template as the
-- source, because document_sections are keyed by template_section_id and those
-- ids do not carry across templates. Kerneopgaver are template-independent and
-- are copied whenever the target template has a kerneopgaver section.
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

  v_same_template := (v_source.template_id IS NOT DISTINCT FROM p_template_id);

  IF p_copy_content AND v_same_template THEN
    INSERT INTO public.document_sections (
      document_id, template_section_id, content,
      draft_content, published_content, updated_at
    )
    SELECT v_new_id, ds.template_section_id, ds.content,
           ds.draft_content, ds.published_content, now()
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

-- 4. Promote a version to current ---------------------------------------------
-- Both updates run in the one function call, so the group is never left without
-- a current version. Demoting before promoting keeps the partial unique index
-- satisfied throughout.
CREATE OR REPLACE FUNCTION public.set_current_document_version(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT version_group_id INTO v_group
    FROM public.documents
   WHERE id = p_document_id;

  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Document % not found', p_document_id;
  END IF;

  IF NOT public.can_manage_document_versions(auth.uid(), v_group) THEN
    RAISE EXCEPTION 'Insufficient permissions to change the current version';
  END IF;

  UPDATE public.documents
     SET is_current = false, updated_at = now()
   WHERE version_group_id = v_group
     AND is_current
     AND id <> p_document_id;

  UPDATE public.documents
     SET is_current = true, updated_at = now()
   WHERE id = p_document_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_current_document_version(uuid) TO authenticated;
