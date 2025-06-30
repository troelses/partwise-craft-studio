
import React from 'react';
import Layout from '@/components/Layout';
import AdminPanel from '@/components/AdminPanel';
import AdminTestComponent from '@/components/AdminTestComponent';

const Admin = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <AdminTestComponent />
        <AdminPanel />
      </div>
    </Layout>
  );
};

export default Admin;
