import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDocuments from "./tools/list-documents";
import searchDocuments from "./tools/search-documents";
import findDocumentsByTitle from "./tools/find-documents-by-title";
import countDocumentsContaining from "./tools/count-documents-containing";
import getDocumentText from "./tools/get-document-text";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "specialer",
  title: "specialer",
  version: "0.1.0",
  instructions:
    "Tools for the Specialedatabase app: browse and read Danish clinical specialty (specialebeskrivelser) and goal (målbeskrivelser) documents. Find a document with find_documents_by_title or search_documents, then read it with get_document_text. All access is scoped to the signed-in user's document permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listDocuments,
    findDocumentsByTitle,
    searchDocuments,
    countDocumentsContaining,
    getDocumentText,
  ],
});
