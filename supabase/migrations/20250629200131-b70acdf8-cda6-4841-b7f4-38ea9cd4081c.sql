
-- Drop the existing problematic RLS policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_profiles;

-- Create simpler, non-recursive RLS policies
CREATE POLICY "Users can view their own profile" 
  ON public.user_profiles 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" 
  ON public.user_profiles 
  FOR SELECT 
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.user_profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admins can update user roles" 
  ON public.user_profiles 
  FOR UPDATE 
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.user_profiles WHERE role = 'admin'
    )
  );

-- Enable RLS on specialer table so it can be accessed
ALTER TABLE public.specialer ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read specialer data
CREATE POLICY "Allow authenticated users to read specialer" 
  ON public.specialer 
  FOR SELECT 
  TO authenticated 
  USING (true);
