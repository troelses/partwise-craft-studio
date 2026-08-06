import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "count_documents_containing",
  title: "Count documents containing a term",
  description: "Count how many accessible documents contain a word or phrase.",
  inputSchema: { search_term: z.string().trim().min(1).describe("Word or phrase to count.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search_term }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("count_documents_containing", { search_term });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ search_term, count: data }) }],
      structuredContent: { search_term, count: data },
    };
  },
});
