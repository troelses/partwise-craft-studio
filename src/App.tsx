
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
          <Route path="/" element={<Index />} />
          <Route path="/specialebeskrivelser" element={<Specialebeskrivelser />} />
          <Route path="/maalbeskrivelser" element={<Maalbeskrivelser />} />
          <Route path="/documents/:id" element={<DocumentView />} />
          <Route path="/documents/new" element={<NewDocument />} />
          <Route path="/team-lead" element={<TeamLead />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
