
import React from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Settings = () => {
  const { toast } = useToast();
  
  const handleShowToast = () => {
    toast({
      title: "Note",
      description: "This is a demo application. In a real application, this page would contain Django database settings, user preferences, etc.",
    });
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-document-blue">Settings</h1>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Database Configuration</CardTitle>
              <CardDescription>
                Configure your Django database connection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 flex">
                <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
                <div>
                  <p className="text-sm text-yellow-700">
                    This is a frontend demo only. In a real application, this would connect to Django for database operations.
                  </p>
                </div>
              </div>
              <Button onClick={handleShowToast}>View Sample Settings</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Preferences</CardTitle>
              <CardDescription>
                Customize your document editing experience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 flex">
                <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
                <div>
                  <p className="text-sm text-yellow-700">
                    User preference settings would be stored in the Django backend.
                  </p>
                </div>
              </div>
              <Button onClick={handleShowToast}>View Sample Preferences</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
