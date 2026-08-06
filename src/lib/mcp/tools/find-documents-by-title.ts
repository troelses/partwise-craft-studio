import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "find_documents_by_title",
  title: "Find documents by title",
  description:
    "Find documents by their title, case-insensitively. Use this when the user refers to a document by name (e.g. 'urologi').",
  inputSchema: { search_term: z.string().trim().min(1).describe("Part of the document title.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search_term }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("find_documents_by_title", { search_term });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { results: data ?? [] },
    };
  },
});
