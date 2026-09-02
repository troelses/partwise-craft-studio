# Prompt 7 — Record the applied migrations in the repo

The three migrations behind the template restructure, kerneopgaver and document
versioning were applied by hand in the Supabase dashboard. They are live and
verified, but the files never reached the repository, so `supabase/migrations/`
does not describe the schema the app actually runs against. A fresh clone plus
`supabase db push` would build a database missing all of it.

This prompt adds the three files. They are inert — no running code imports them.

> **Do not execute any of this SQL.** Every statement below has *already* been
> applied to the Supabase project by hand, and verified with
> `schema-status.sql` (all rows `ok`). This prompt only adds the files to the
> repository so the schema history is recorded in version control.
>
> Specifically: do **not** run these against the database, do **not** apply them
> through the Supabase integration, do **not** generate new or "corrected"
> migrations, and do **not** alter the database in any way. Create the files
> with exactly the contents given, byte for byte, and change nothing else.


---

## 1. Create `supabase/migrations/20260831120000-update-template-add-kerneopgaver.sql`

```sql
-- Create a new "specialebeskrivelse_310826" template matching the new
-- specialebeskrivelse structure, and add tables for the dynamic kerneopgaver
-- feature.
--
-- This migration is purely additive: the previous template
-- (439df5fa-9aa6-4c2f-bb71-f26fa4b29f03) and all of its sections are left
-- untouched, so existing documents keep rendering against the template they
-- were created with. New documents use the new template.
--
-- The whole script is idempotent and can safely be re-run.

-- 1. section_key column -------------------------------------------------------
-- Used by the frontend to identify sections that need special rendering
-- (currently only the kerneopgaver section).
ALTER TABLE public.template_sections
  ADD COLUMN IF NOT EXISTS section_key TEXT;

-- 2. New template -------------------------------------------------------------
INSERT INTO public.templates (id, name, description)
VALUES (
  'b9a66e83-b40f-417d-abe8-14050e00c5c3',
  'specialebeskrivelse_310826',
  'Specialebeskrivelse-skabelon (revideret 31-08-2026) med dynamiske kerneopgaver.'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Sections for the new template --------------------------------------------
INSERT INTO public.template_sections (template_id, name, position, level, description, section_key)
SELECT * FROM (VALUES
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '1. Kort overordnet beskrivelse af specialet', 10, 1,
   'Beskriv specialets generelle karakter, patientgruppe og organisering.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '2.1 Generelle opgaver', 20, 2,
   'Generelle opgaver der kan varetages på tværs af specialer.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '2.2 Kerneopgaver', 30, 2,
   'Introduktionstekst til kerneopgaverne samt liste over specialets kerneopgaver.',
   'kerneopgaver'::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '3. Øvrige samarbejdende faggrupper', 40, 1,
   'Det tværfaglige og tværsektorielle samarbejde.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '4. Forventet udvikling af teknologi og behandlingsmetoder', 50, 1,
   'Teknologisk og metodisk udvikling inden for specialet i et 10-15-årigt perspektiv.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '5. Arbejdsgruppens medlemmer', 60, 1,
   'Medlemmer af den arbejdsgruppe der har udarbejdet specialebeskrivelsen.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '6. Anvendt materiale', 70, 1,
   'Referenceliste over det materiale arbejdsgruppen har anvendt.', NULL::text)
) AS v(template_id, name, position, level, description, section_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.template_sections ts
  WHERE ts.template_id = 'b9a66e83-b40f-417d-abe8-14050e00c5c3'
);

-- 4. kerneopgaver table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kerneopgaver (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. kerneopgave_sections table -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.kerneopgave_sections (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kerneopgave_id  UUID NOT NULL REFERENCES public.kerneopgaver(id) ON DELETE CASCADE,
  section_type    TEXT NOT NULL CHECK (section_type IN (
                    'almenmedicinske_tilbud',
                    'speciallaegepraksis',
                    'sygehus',
                    'faellesopgaver',
                    'fremtidig_varetagelse'
                  )),
  draft_content   JSONB,
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(kerneopgave_id, section_type)
);

-- 6. RLS ----------------------------------------------------------------------
ALTER TABLE public.kerneopgaver         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kerneopgave_sections ENABLE ROW LEVEL SECURITY;

-- Admins: full access
DROP POLICY IF EXISTS "Admins can manage kerneopgaver" ON public.kerneopgaver;
CREATE POLICY "Admins can manage kerneopgaver"
  ON public.kerneopgaver FOR ALL
  USING (public.check_user_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage kerneopgave_sections" ON public.kerneopgave_sections;
CREATE POLICY "Admins can manage kerneopgave_sections"
  ON public.kerneopgave_sections FOR ALL
  USING (public.check_user_role(auth.uid(), 'admin'));

-- Team leads: full access on their documents
DROP POLICY IF EXISTS "Team leads can manage kerneopgaver" ON public.kerneopgaver;
CREATE POLICY "Team leads can manage kerneopgaver"
  ON public.kerneopgaver FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = kerneopgaver.document_id
        AND d.team_lead_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team leads can manage kerneopgave_sections" ON public.kerneopgave_sections;
CREATE POLICY "Team leads can manage kerneopgave_sections"
  ON public.kerneopgave_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
      JOIN public.documents d ON d.id = k.document_id
      WHERE k.id = kerneopgave_sections.kerneopgave_id
        AND d.team_lead_id = auth.uid()
    )
  );

-- Editors (users with can_edit permission on the document): full access
DROP POLICY IF EXISTS "Editors can manage kerneopgaver" ON public.kerneopgaver;
CREATE POLICY "Editors can manage kerneopgaver"
  ON public.kerneopgaver FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id       = auth.uid()
        AND up.document_id   = kerneopgaver.document_id::text
        AND up.can_edit      = true
    )
  );

DROP POLICY IF EXISTS "Editors can manage kerneopgave_sections" ON public.kerneopgave_sections;
CREATE POLICY "Editors can manage kerneopgave_sections"
  ON public.kerneopgave_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
      JOIN public.user_permissions up
        ON up.document_id = k.document_id::text
      WHERE k.id           = kerneopgave_sections.kerneopgave_id
        AND up.user_id     = auth.uid()
        AND up.can_edit    = true
    )
  );

-- Viewers: read only
DROP POLICY IF EXISTS "Viewers can read kerneopgaver" ON public.kerneopgaver;
CREATE POLICY "Viewers can read kerneopgaver"
  ON public.kerneopgaver FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id     = auth.uid()
        AND up.document_id = kerneopgaver.document_id::text
        AND up.can_view    = true
    )
  );

DROP POLICY IF EXISTS "Viewers can read kerneopgave_sections" ON public.kerneopgave_sections;
CREATE POLICY "Viewers can read kerneopgave_sections"
  ON public.kerneopgave_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
      JOIN public.user_permissions up
        ON up.document_id = k.document_id::text
      WHERE k.id         = kerneopgave_sections.kerneopgave_id
        AND up.user_id   = auth.uid()
        AND up.can_view  = true
    )
  );

-- 7. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kerneopgaver_document_id
  ON public.kerneopgaver(document_id);
CREATE INDEX IF NOT EXISTS idx_kerneopgaver_position
  ON public.kerneopgaver(document_id, position);
CREATE INDEX IF NOT EXISTS idx_kerneopgave_sections_kerneopgave_id
  ON public.kerneopgave_sections(kerneopgave_id);
```

## 2. Create `supabase/migrations/20260901090000-document-versioning.sql`

```sql
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
```

## 3. Create `supabase/migrations/20260902090000-versioning-on-document-access.sql`

```sql
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
```

---

After this, also apply **prompt 8**, which adds the two verification scripts and
explains how to stop these migrations being replayed by a future `db push`.
