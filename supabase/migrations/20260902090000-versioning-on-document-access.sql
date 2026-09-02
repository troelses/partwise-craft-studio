-- Adapt document versioning to the document_access permission model.
--
-- 20260901090000 built versioning against documents.team_lead_id. That column
-- is now deprecated: authority lives in document_access (view < write <
-- approve), and RLS on documents means no grant = no visibility.
--
-- This migration changes behaviour only; every signature is unchanged, so the
-- existing frontend RPC calls keep working.
--
-- Three problems it fixes:
--
--   1. Version lists appeared broken. Each version is its own documents row and
--      RLS requires a per-row grant, so a new version was visible only to
--      whoever created it — not to the people who could see the version it came
--      from. New versions now inherit the source version's grants.
--
--   2. Privilege escalation. The on_document_created trigger grants the creator
--      'approve'. Routed through version creation that let a 'write' user mint a
--      version they could then publish. The grant copy below overwrites that
--      auto-grant with the creator's actual level on the source document, so no
--      one gains authority by creating a version. Admins are unaffected.
--
--   3. A new version arrived pre-published. Copying published_content meant a
--      version was born approved, bypassing the approve-gated publish path. A
--      new version now starts as a draft: content is seeded from the source's
--      draft (falling back to its published text), published_content is left
--      null, and is_approved defaults to false.
--
-- Idempotent: safe to re-run.

-- 1. Who may create a version: write-level on any version in the group --------
-- Signature and name are unchanged so documentService.canManageVersions keeps
-- working; only the source of authority moves to document_access.
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
      OR EXISTS (
        SELECT 1
          FROM public.documents d
          JOIN public.document_access da ON da.document_id = d.id
         WHERE d.version_group_id = p_version_group_id
           AND da.user_id    = p_user_id
           AND da.permission IN ('write', 'approve')
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_document_versions(uuid, uuid) TO authenticated;

-- 2. Who may change which version is current: approve-level -------------------
-- Promoting a version decides what everyone sees by default, so it is a
-- publishing act and is gated like one.
CREATE OR REPLACE FUNCTION public.can_publish_document_version(
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
      OR EXISTS (
        SELECT 1
          FROM public.documents d
          JOIN public.document_access da ON da.document_id = d.id
         WHERE d.version_group_id = p_version_group_id
           AND da.user_id    = p_user_id
           AND da.permission = 'approve'
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_publish_document_version(uuid, uuid) TO authenticated;

-- 3. Create a version: inherit grants, start as a draft -----------------------
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

  v_same_template := (v_source.template_id IS NOT DISTINCT FROM p_template_id);

  -- Sections are keyed by template_section_id, so content only carries across
  -- when the template is unchanged. The new version starts unpublished:
  -- published_content stays null and is_approved keeps its false default.
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

-- 4. Promote a version to current: approve-level ------------------------------
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

  IF NOT public.can_publish_document_version(auth.uid(), v_group) THEN
    RAISE EXCEPTION 'Only approvers can change the current version';
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
