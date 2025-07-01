
-- Add team_lead_id column to documents table to designate team leads
ALTER TABLE public.documents 
ADD COLUMN team_lead_id uuid REFERENCES auth.users(id);

-- Create RLS policy to allow team leads to manage their assigned documents
CREATE POLICY "Team leads can manage their assigned documents" 
ON public.documents 
FOR ALL 
USING (auth.uid() = team_lead_id);

-- Update document_sections RLS to allow team leads to approve content
CREATE POLICY "Team leads can approve document sections" 
ON public.document_sections 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.documents 
    WHERE documents.id = document_sections.document_id 
    AND documents.team_lead_id = auth.uid()
  )
);

-- Create a function to check if user is team lead for a document
CREATE OR REPLACE FUNCTION public.check_team_lead(user_id uuid, doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.documents 
    WHERE id = doc_id 
    AND team_lead_id = user_id
  );
$$;

-- Add approval tracking fields to document_sections if not already present
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_sections' AND column_name = 'approved_by') THEN
    ALTER TABLE public.document_sections ADD COLUMN approved_by uuid REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_sections' AND column_name = 'approved_at') THEN
    ALTER TABLE public.document_sections ADD COLUMN approved_at timestamp with time zone;
  END IF;
END $$;
