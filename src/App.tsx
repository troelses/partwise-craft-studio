
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Specialebeskrivelser from "./pages/Specialebeskrivelser";
import Maalbeskrivelser from "./pages/Maalbeskrivelser";
import DocumentView from "./pages/DocumentView";
import NewDocument from "./pages/NewDocument";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import TeamLead from "./pages/TeamLead";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import AuthGuard from "./components/AuthGuard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<AuthGuard><Index /></AuthGuard>} />
          <Route path="/specialebeskrivelser" element={<AuthGuard><Specialebeskrivelser /></AuthGuard>} />
          <Route path="/maalbeskrivelser" element={<AuthGuard><Maalbeskrivelser /></AuthGuard>} />
          <Route path="/documents/:id" element={<AuthGuard><DocumentView /></AuthGuard>} />
          <Route path="/documents/new" element={<AuthGuard><NewDocument /></AuthGuard>} />
          <Route path="/team-lead" element={<AuthGuard><TeamLead /></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
          <Route path="/admin" element={<AuthGuard><Admin /></AuthGuard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
