
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Plus, Settings, LogOut, Shield, BookOpen, Target } from 'lucide-react';
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

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    const adminStatus = await authService.isAdmin();
    setIsAdmin(adminStatus);
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
    { path: '/', label: 'Documents', icon: FileText },
    { path: '/specialebeskrivelser', label: 'Specialebeskrivelser', icon: BookOpen },
    { path: '/maalbeskrivelser', label: 'Målbeskrivelser', icon: Target },
    { path: '/documents/new', label: 'New Document', icon: Plus },
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
            <h1 className="text-xl font-bold text-gray-900">Document Manager</h1>
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
