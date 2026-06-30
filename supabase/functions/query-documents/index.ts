// Edge Function: query-documents
// Read-only AI Q&A over the document library. Verifies the caller's JWT and
// runs every document query through a client scoped to that JWT, so RLS
// applies. The OpenAI key lives only here (server-side).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o';

const tools = [
  { type: 'function', function: {
      name: 'count_documents_containing',
      description: "Count how many documents contain a word/phrase. Use for 'how many documents contain X'.",
      parameters: { type: 'object', properties: { search_term: { type: 'string' } }, required: ['search_term'] } } },
  { type: 'function', function: {
      name: 'search_documents',
      description: 'Find which documents contain a word/phrase. Returns document ids, titles and match counts.',
      parameters: { type: 'object', properties: { search_term: { type: 'string' } }, required: ['search_term'] } } },
  { type: 'function', function: {
      name: 'list_documents',
      description: 'List the documents (id + title) the user can access.',
      parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: {
      name: 'get_document_text',
      description: 'Get the full approved text of one document by id, section by section. Use to read or compare specific documents.',
      parameters: { type: 'object', properties: { doc_id: { type: 'string' } }, required: ['doc_id'] } } },
];

const systemPrompt =
  'You answer questions about a library of Danish clinical specialty and goal ' +
  'descriptions, using ONLY the provided tools. Pick the right tool: counting ' +
  "questions -> count_documents_containing; 'which documents mention X' -> " +
  'search_documents; comparing or reading specific documents -> get_document_text ' +
  '(find ids via search_documents or list_documents first). Base every factual ' +
  'claim on tool results, never assumptions. If a search returns nothing, say so. ' +
  'Answer in the language the user used.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await db.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { question } = await req.json() as { question?: string };
    if (!question) return json({ error: 'question is required' }, 400);

    const impls: Record<string, (args: any) => Promise<unknown>> = {
      count_documents_containing: async ({ search_term }) => {
        const { data, error } = await db.rpc('count_documents_containing', { search_term });
        return error ? { error: error.message } : { search_term, count: data };
      },
      search_documents: async ({ search_term }) => {
        const { data, error } = await db.rpc('search_documents', { search_term });
        return error ? { error: error.message } : { results: data };
      },
      list_documents: async () => {
        const { data, error } = await db.from('documents')
          .select('id, title').order('created_at', { ascending: false });
        return error ? { error: error.message } : { documents: data };
      },
      get_document_text: async ({ doc_id }) => {
        const { data, error } = await db.rpc('get_document_text', { doc_id });
        return error ? { error: error.message } : { doc_id, sections: data };
      },
    };

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ];

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 500);

    for (let step = 0; step < 8; step++) {
      const resp = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages, tools }),
      });
      const data = await resp.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return json({ error: 'No response from model', detail: data }, 502);
      messages.push(msg);

      if (!msg.tool_calls?.length) {
        return json({ answer: msg.content });
      }

      for (const call of msg.tool_calls) {
        const fn = impls[call.function.name];
        let result: unknown;
        try {
          result = fn
            ? await fn(JSON.parse(call.function.arguments))
            : { error: `unknown tool ${call.function.name}` };
        } catch (e) {
          result = { error: String(e) };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    return json({ error: 'Stopped after too many tool steps' }, 500);
  } catch (_e) {
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
