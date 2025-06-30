
-- Fix infinite recursion in RLS policies by creating a simpler approach

-- Drop the existing problematic RLS policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_profiles;

-- Create a security definer function to check admin status without RLS
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE user_profiles.user_id = $1 AND role = 'admin'
  );
$$;

-- Create new non-recursive RLS policies
CREATE POLICY "Users can view their own profile" 
  ON public.user_profiles 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" 
  ON public.user_profiles 
  FOR SELECT 
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update user roles" 
  ON public.user_profiles 
  FOR UPDATE 
  USING (public.is_admin(auth.uid()));

-- Also fix the user_permissions policies if they have similar issues
DROP POLICY IF EXISTS "Admins can manage all permissions" ON public.user_permissions;

CREATE POLICY "Admins can manage all permissions" 
  ON public.user_permissions 
  FOR ALL 
  USING (public.is_admin(auth.uid()));
