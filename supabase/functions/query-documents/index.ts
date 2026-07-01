import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Model names move fast — override via the GEMINI_MODEL secret if needed.
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const functionDeclarations = [
  {
    name: "count_documents_containing",
    description: "Count how many documents contain a word/phrase. Use for 'how many documents contain X'.",
    parameters: { type: "object", properties: { search_term: { type: "string" } }, required: ["search_term"] },
  },
  {
    name: "search_documents",
    description: "Find which documents contain a word/phrase. Returns document ids, titles and match counts.",
    parameters: { type: "object", properties: { search_term: { type: "string" } }, required: ["search_term"] },
  },
  {
    name: "list_documents",
    description: "List the documents (id + title) the user can access.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_document_text",
    description:
      "Get the full approved text of one document by id, section by section. Use to read or compare specific documents.",
    parameters: { type: "object", properties: { doc_id: { type: "string" } }, required: ["doc_id"] },
  },
];
const tools = [{ functionDeclarations }];

const systemInstruction = {
  parts: [
    {
      text:
        "You answer questions about a library of Danish clinical specialty and goal " +
        "descriptions, using ONLY the provided tools. Pick the right tool: counting " +
        "questions -> count_documents_containing; 'which documents mention X' -> " +
        "search_documents; comparing or reading specific documents -> get_document_text " +
        "(find ids via search_documents or list_documents first). Base every factual " +
        "claim on tool results, never assumptions. If a search returns nothing, say so. " +
        "Answer in the language the user used.",
    },
  ],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    // Caller-scoped client: all queries below are filtered by the caller's RLS.
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await db.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { question } = (await req.json()) as { question?: string };
    if (!question) return json({ error: "question is required" }, 400);

    const impls: Record<string, (args: any) => Promise<unknown>> = {
      count_documents_containing: async ({ search_term }) => {
        const { data, error } = await db.rpc("count_documents_containing", { search_term });
        return error ? { error: error.message } : { search_term, count: data };
      },
      search_documents: async ({ search_term }) => {
        const { data, error } = await db.rpc("search_documents", { search_term });
        return error ? { error: error.message } : { results: data };
      },
      list_documents: async () => {
        const { data, error } = await db
          .from("documents")
          .select("id, title")
          .order("created_at", { ascending: false });
        return error ? { error: error.message } : { documents: data };
      },
      get_document_text: async ({ doc_id }) => {
        const { data, error } = await db.rpc("get_document_text", { doc_id });
        return error ? { error: error.message } : { doc_id, sections: data };
      },
    };

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "GEMINI_API_KEY not configured" }, 500);

    const contents: any[] = [{ role: "user", parts: [{ text: question }] }];

    for (let step = 0; step < 8; step++) {
      const resp = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction, contents, tools }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error("Gemini HTTP", resp.status, JSON.stringify(data));
        return json({ error: "Gemini request failed", status: resp.status, detail: data }, 502);
      }

      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      if (parts.length === 0) {
        console.error("Gemini no parts, finishReason:", candidate?.finishReason, JSON.stringify(data));
        return json(
          {
            error: "No response from model",
            finishReason: candidate?.finishReason ?? null,
            detail: data,
          },
          502,
        );
      }
      const calls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      if (calls.length === 0) {
        const text = parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text)
          .join("");
        return json({ answer: text });
      }

      contents.push(candidate.content);
      const responseParts: any[] = [];
      for (const call of calls) {
        const fn = impls[call.name];
        let result: unknown;
        try {
          result = fn ? await fn(call.args ?? {}) : { error: `unknown tool ${call.name}` };
        } catch (e) {
          result = { error: String(e) };
        }
        responseParts.push({ functionResponse: { name: call.name, response: result } });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    return json({ error: "Stopped after too many tool steps" }, 500);
  } catch (_e) {
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
