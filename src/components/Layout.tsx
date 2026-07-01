
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Plus, Settings, LogOut, Shield, BookOpen, Target, Users, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/services/authService';
import { useToast } from '@/hooks/use-toast';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeamLead, setIsTeamLead] = useState(false);

  useEffect(() => {
    // Run once on mount for the current session, then re-run whenever the
    // session changes (e.g. sign-in, sign-out, token refresh, role change).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
      checkTeamLeadStatus();
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminStatus = async () => {
    const adminStatus = await authService.isAdmin();
    setIsAdmin(adminStatus);
  };

  const checkTeamLeadStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Show the Redaktør tab if the user has approver access to any document
      const { data, error } = await supabase
        .from('document_access')
        .select('document_id')
        .eq('user_id', user.id)
        .eq('permission', 'approve')
        .limit(1);

      if (error) {
        console.error('Error checking team lead status:', error);
        return;
      }

      setIsTeamLead(data && data.length > 0);
    } catch (error) {
      console.error('Error checking team lead status:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/auth');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const navItems = [
    { path: '/specialebeskrivelser', label: 'Specialebeskrivelser', icon: BookOpen },
    { path: '/maalbeskrivelser', label: 'Målbeskrivelser', icon: Target },
    { path: '/ask-ai', label: 'Spørg AI', icon: MessageSquare },
    ...(isTeamLead ? [{ path: '/team-lead', label: 'Redaktør', icon: Users }] : []),
    { path: '/settings', label: 'Settings', icon: Settings },
    ...(isAdmin ? [{ path: '/admin', label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b">
            <h1 className="text-xl font-bold text-gray-900">Specialedatabase</h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Sign out button */}
          <div className="p-4 border-t">
            <Button
              onClick={handleSignOut}
              variant="ghost"
              className="w-full flex items-center space-x-3 px-3 py-2 text-gray-700 hover:bg-gray-100"
            >
              <LogOut className="h-5 w-5" />
              <span>Sign Out</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-64">
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
