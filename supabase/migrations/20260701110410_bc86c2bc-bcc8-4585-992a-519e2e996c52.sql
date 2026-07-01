-- 1) Access table
CREATE TABLE IF NOT EXISTS public.document_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('view','write','approve')),
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_access TO authenticated;
GRANT ALL ON public.document_access TO service_role;

CREATE INDEX IF NOT EXISTS idx_document_access_document ON public.document_access(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_user     ON public.document_access(user_id);

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2) Permission helpers
CREATE OR REPLACE FUNCTION public.has_document_access(doc_id uuid, uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.check_user_role(uid, 'admin')
      OR EXISTS (SELECT 1 FROM public.document_access
                 WHERE document_id = doc_id AND user_id = uid);
$$;

CREATE OR REPLACE FUNCTION public.can_write_document(doc_id uuid, uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.check_user_role(uid, 'admin')
      OR EXISTS (SELECT 1 FROM public.document_access
                 WHERE document_id = doc_id AND user_id = uid
                   AND permission IN ('write','approve'));
$$;

CREATE OR REPLACE FUNCTION public.can_approve_document(doc_id uuid, uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.check_user_role(uid, 'admin')
      OR EXISTS (SELECT 1 FROM public.document_access
                 WHERE document_id = doc_id AND user_id = uid
                   AND permission = 'approve');
$$;

GRANT EXECUTE ON FUNCTION public.has_document_access(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_document(uuid,uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_approve_document(uuid,uuid) TO authenticated;

-- 3) Auto-grant the creator 'approve' access
CREATE OR REPLACE FUNCTION public.grant_creator_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.document_access (document_id, user_id, permission, granted_by)
    VALUES (NEW.id, auth.uid(), 'approve', auth.uid())
    ON CONFLICT (document_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_document_created ON public.documents;
CREATE TRIGGER on_document_created
  AFTER INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.grant_creator_access();

-- 4) Migrate existing team leads
INSERT INTO public.document_access (document_id, user_id, permission, granted_by)
SELECT id, team_lead_id, 'approve', team_lead_id
FROM public.documents
WHERE team_lead_id IS NOT NULL
ON CONFLICT (document_id, user_id) DO NOTHING;

-- 5) Approval RPC
CREATE OR REPLACE FUNCTION public.approve_section(section_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE doc uuid;
BEGIN
  SELECT document_id INTO doc FROM public.document_sections WHERE id = section_id;
  IF doc IS NULL THEN RETURN false; END IF;
  IF NOT public.can_approve_document(doc, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to approve this section';
  END IF;
  UPDATE public.document_sections
     SET published_content = draft_content,
         is_approved       = true,
         approved_by       = auth.uid(),
         approved_at       = now(),
         updated_at        = now()
   WHERE id = section_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_section(uuid) TO authenticated;

-- 6) Publish guard
CREATE OR REPLACE FUNCTION public.guard_section_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_approve_document(NEW.document_id, auth.uid()) THEN
    IF (NEW.is_approved IS TRUE AND OLD.is_approved IS DISTINCT FROM TRUE)
       OR (NEW.published_content IS DISTINCT FROM OLD.published_content) THEN
      RAISE EXCEPTION 'Only approvers can publish a section';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_section_publish_trg ON public.document_sections;
CREATE TRIGGER guard_section_publish_trg
  BEFORE UPDATE ON public.document_sections
  FOR EACH ROW EXECUTE FUNCTION public.guard_section_publish();

-- 7) RLS: document_access
ALTER TABLE public.document_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read document_access" ON public.document_access FOR SELECT
USING (
  user_id = auth.uid()
  OR public.check_user_role(auth.uid(),'admin')
  OR public.can_approve_document(document_id, auth.uid())
);

CREATE POLICY "admins insert access" ON public.document_access FOR INSERT
  WITH CHECK (public.check_user_role(auth.uid(),'admin'));

CREATE POLICY "admins update access" ON public.document_access FOR UPDATE
  USING (public.check_user_role(auth.uid(),'admin'))
  WITH CHECK (public.check_user_role(auth.uid(),'admin'));

CREATE POLICY "admins delete access" ON public.document_access FOR DELETE
  USING (public.check_user_role(auth.uid(),'admin'));

CREATE POLICY "approvers insert vw access" ON public.document_access FOR INSERT
  WITH CHECK (
    public.can_approve_document(document_id, auth.uid())
    AND permission IN ('view','write')
    AND NOT public.check_user_role(user_id,'admin')
  );

CREATE POLICY "approvers update vw access" ON public.document_access FOR UPDATE
  USING (
    public.can_approve_document(document_id, auth.uid())
    AND permission IN ('view','write')
    AND NOT public.check_user_role(user_id,'admin')
  )
  WITH CHECK (
    public.can_approve_document(document_id, auth.uid())
    AND permission IN ('view','write')
    AND NOT public.check_user_role(user_id,'admin')
  );

CREATE POLICY "approvers delete vw access" ON public.document_access FOR DELETE
  USING (
    public.can_approve_document(document_id, auth.uid())
    AND permission IN ('view','write')
    AND NOT public.check_user_role(user_id,'admin')
  );

-- 8) RLS: documents
DROP POLICY IF EXISTS "Team leads can manage their assigned documents" ON public.documents;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select documents by access" ON public.documents FOR SELECT
  USING (public.has_document_access(id, auth.uid()));

CREATE POLICY "create documents (editors+admins)" ON public.documents FOR INSERT
  WITH CHECK (
    public.check_user_role(auth.uid(),'admin')
    OR public.check_user_role(auth.uid(),'editor')
  );

CREATE POLICY "update documents (write+)" ON public.documents FOR UPDATE
  USING (public.can_write_document(id, auth.uid()))
  WITH CHECK (public.can_write_document(id, auth.uid()));

CREATE POLICY "delete documents (admins only)" ON public.documents FOR DELETE
  USING (public.check_user_role(auth.uid(),'admin'));

-- 9) RLS: document_sections
DROP POLICY IF EXISTS "Team leads can approve document sections" ON public.document_sections;

ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select sections by access" ON public.document_sections FOR SELECT
  USING (public.has_document_access(document_id, auth.uid()));

CREATE POLICY "insert sections (write+)" ON public.document_sections FOR INSERT
  WITH CHECK (public.can_write_document(document_id, auth.uid()));

CREATE POLICY "update sections (write+)" ON public.document_sections FOR UPDATE
  USING (public.can_write_document(document_id, auth.uid()))
  WITH CHECK (public.can_write_document(document_id, auth.uid()));

CREATE POLICY "delete sections (admins only)" ON public.document_sections FOR DELETE
  USING (public.check_user_role(auth.uid(),'admin'));