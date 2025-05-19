
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  FileText, 
  PlusCircle, 
  Settings, 
  Menu,
  ChevronLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const location = useLocation();

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const navItems = [
    { 
      icon: <FileText className="h-5 w-5" />, 
      name: 'Documents', 
      path: '/' 
    },
    { 
      icon: <Settings className="h-5 w-5" />, 
      name: 'Settings', 
      path: '/settings' 
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-document-blue text-white transition-all duration-300 flex flex-col",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-white/10">
          {!sidebarCollapsed && (
            <h1 className="text-xl font-bold">DocStruct</h1>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar} 
            className="hover:bg-white/10"
          >
            {sidebarCollapsed ? (
              <Menu className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 pt-4">
          <ul>
            {navItems.map((item) => (
              <li key={item.name}>
                <Link 
                  to={item.path} 
                  className={cn(
                    "flex items-center px-4 py-3 hover:bg-white/10 transition-colors",
                    location.pathname === item.path && "bg-white/20",
                    sidebarCollapsed ? "justify-center" : "space-x-3"
                  )}
                >
                  {item.icon}
                  {!sidebarCollapsed && <span>{item.name}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Create new document button */}
        <div className="p-4 border-t border-white/10">
          <Link to="/documents/new">
            <Button 
              className={cn(
                "bg-white text-document-blue hover:bg-gray-100 w-full",
                sidebarCollapsed && "p-2"
              )}
            >
              <PlusCircle className="h-5 w-5" />
              {!sidebarCollapsed && <span className="ml-2">New Document</span>}
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  );
};

export default Layout;
