import React, { useState } from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const AskAI: React.FC = () => {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setQuestion('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('query-documents', {
        body: { question: q },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data?.answer ?? '(no answer)' },
      ]);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message ?? 'Failed to query documents',
        variant: 'destructive',
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err?.message ?? 'request failed'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spørg dokumenterne</h1>
          <p className="text-gray-600">
            Stil spørgsmål om de godkendte specialebeskrivelser og målbeskrivelser.
          </p>
        </div>

        <Card className="min-h-[400px]">
          <CardHeader>
            <CardTitle className="text-base">Samtale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-500">
                Prøv f.eks. "Hvor mange dokumenter nævner sedation?"
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`p-3 rounded-md whitespace-pre-wrap text-sm ${
                  m.role === 'user'
                    ? 'bg-blue-50 text-gray-900'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="font-medium text-xs text-gray-500 mb-1">
                  {m.role === 'user' ? 'Dig' : 'AI'}
                </div>
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Tænker...
              </div>
            )}
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Stil et spørgsmål..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as any);
              }
            }}
          />
          <Button type="submit" disabled={loading || !question.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Layout>
  );
};

export default AskAI;
