
-- Drop all existing problematic RLS policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_profiles;

-- Drop the existing is_admin function if it exists
DROP FUNCTION IF EXISTS public.is_admin(uuid);

-- Create a simple, non-recursive security definer function
CREATE OR REPLACE FUNCTION public.check_user_role(user_id uuid, required_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_profiles 
    WHERE user_profiles.user_id = $1 
    AND user_profiles.role = $2
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
  USING (public.check_user_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update user roles" 
  ON public.user_profiles 
  FOR UPDATE 
  USING (public.check_user_role(auth.uid(), 'admin'));

-- Also update user_permissions policies
DROP POLICY IF EXISTS "Admins can manage all permissions" ON public.user_permissions;

CREATE POLICY "Admins can manage all permissions" 
  ON public.user_permissions 
  FOR ALL 
  USING (public.check_user_role(auth.uid(), 'admin'));

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.check_user_role(uuid, text) TO authenticated;
