import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_document_text",
  title: "Get document text",
  description:
    "Get the full approved text of one document by id, section by section. Find the id with find_documents_by_title, search_documents or list_documents first.",
  inputSchema: { doc_id: z.string().uuid().describe("The document id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ doc_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("get_document_text", { doc_id });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { doc_id, sections: data ?? [] },
    };
  },
});
