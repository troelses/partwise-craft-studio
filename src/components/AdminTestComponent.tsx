
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/services/authService';
import { useToast } from '@/hooks/use-toast';

const AdminTestComponent = () => {
  const [testEmail, setTestEmail] = useState('admin@test.com');
  const [testPassword, setTestPassword] = useState('admin123');
  const [isCreating, setIsCreating] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const { toast } = useToast();

  const createTestAdminUser = async () => {
    setIsCreating(true);
    setDebugInfo('');

    try {
      // First, check current user status
      const currentProfile = await authService.getCurrentUserProfile();
      setDebugInfo(prev => prev + `Current user profile: ${JSON.stringify(currentProfile)}\n`);

      // Create the user account
      const { data, error } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true
      });

      if (error) {
        setDebugInfo(prev => prev + `Error creating user: ${error.message}\n`);
        throw error;
      }

      if (data.user) {
        setDebugInfo(prev => prev + `User created: ${data.user.id}\n`);

        // Update the user role to admin
        const roleUpdateSuccess = await authService.updateUserRole(data.user.id, 'admin');
        setDebugInfo(prev => prev + `Role update success: ${roleUpdateSuccess}\n`);

        if (roleUpdateSuccess) {
          toast({
            title: "Success",
            description: `Test admin user created: ${testEmail}`,
          });
        } else {
          toast({
            title: "Warning",
            description: "User created but role update failed",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      setDebugInfo(prev => prev + `Final error: ${error.message}\n`);
      toast({
        title: "Error",
        description: error.message || "Failed to create test admin user",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const checkCurrentUserStatus = async () => {
    try {
      const profile = await authService.getCurrentUserProfile();
      const isAdmin = await authService.isAdmin();
      const { data: { user } } = await supabase.auth.getUser();
      
      setDebugInfo(`
Current User ID: ${user?.id || 'Not logged in'}
Current User Email: ${user?.email || 'Not logged in'}
Profile: ${JSON.stringify(profile, null, 2)}
Is Admin: ${isAdmin}
      `);
    } catch (error: any) {
      setDebugInfo(`Error checking status: ${error.message}`);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Admin Test Helper</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="Test admin email"
          />
          <Input
            type="password"
            value={testPassword}
            onChange={(e) => setTestPassword(e.target.value)}
            placeholder="Test admin password"
          />
        </div>
        
        <div className="space-y-2">
          <Button 
            onClick={createTestAdminUser} 
            disabled={isCreating}
            className="w-full"
          >
            {isCreating ? 'Creating...' : 'Create Test Admin User'}
          </Button>
          
          <Button 
            onClick={checkCurrentUserStatus} 
            variant="outline"
            className="w-full"
          >
            Check Current User Status
          </Button>
        </div>

        {debugInfo && (
          <div className="bg-gray-100 p-3 rounded text-sm">
            <pre className="whitespace-pre-wrap">{debugInfo}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminTestComponent;
