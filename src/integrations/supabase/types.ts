export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      assessment_methods: {
        Row: {
          competence_id: number | null
          description: string
          id: number
        }
        Insert: {
          competence_id?: number | null
          description: string
          id?: never
        }
        Update: {
          competence_id?: number | null
          description?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "assessment_methods_competence_id_fkey"
            columns: ["competence_id"]
            isOneToOne: false
            referencedRelation: "competences"
            referencedColumns: ["id"]
          },
        ]
      }
      competence_sections: {
        Row: {
          id: number
          section_name: string
          training_document_id: number | null
        }
        Insert: {
          id?: never
          section_name: string
          training_document_id?: number | null
        }
        Update: {
          id?: never
          section_name?: string
          training_document_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competence_sections_training_document_id_fkey"
            columns: ["training_document_id"]
            isOneToOne: false
            referencedRelation: "training_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      competences: {
        Row: {
          competence_section_id: number | null
          description: string | null
          id: number
          name: string
          number: number | null
        }
        Insert: {
          competence_section_id?: number | null
          description?: string | null
          id?: never
          name: string
          number?: number | null
        }
        Update: {
          competence_section_id?: number | null
          description?: string | null
          id?: never
          name?: string
          number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competences_competence_section_id_fkey"
            columns: ["competence_section_id"]
            isOneToOne: false
            referencedRelation: "competence_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      course_assessment_methods: {
        Row: {
          description: string
          id: number
          mandatory_course_id: number | null
        }
        Insert: {
          description: string
          id?: never
          mandatory_course_id?: number | null
        }
        Update: {
          description?: string
          id?: never
          mandatory_course_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_assessment_methods_mandatory_course_id_fkey"
            columns: ["mandatory_course_id"]
            isOneToOne: false
            referencedRelation: "mandatory_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      document_section_versions: {
        Row: {
          content: Json
          created_at: string | null
          created_by: string | null
          document_section_id: string | null
          id: string
          is_published: boolean | null
        }
        Insert: {
          content: Json
          created_at?: string | null
          created_by?: string | null
          document_section_id?: string | null
          id?: string
          is_published?: boolean | null
        }
        Update: {
          content?: Json
          created_at?: string | null
          created_by?: string | null
          document_section_id?: string | null
          id?: string
          is_published?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "document_section_versions_document_section_id_fkey"
            columns: ["document_section_id"]
            isOneToOne: false
            referencedRelation: "document_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sections: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: string
          document_id: string | null
          draft_content: Json | null
          id: string
          is_approved: boolean | null
          last_edited_by: string | null
          locked_at: string | null
          locked_by: string | null
          published_content: Json | null
          template_section_id: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          document_id?: string | null
          draft_content?: Json | null
          id?: string
          is_approved?: boolean | null
          last_edited_by?: string | null
          locked_at?: string | null
          locked_by?: string | null
          published_content?: Json | null
          template_section_id?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          document_id?: string | null
          draft_content?: Json | null
          id?: string
          is_approved?: boolean | null
          last_edited_by?: string | null
          locked_at?: string | null
          locked_by?: string | null
          published_content?: Json | null
          template_section_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_sections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_sections_template_section_id_fkey"
            columns: ["template_section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          id: string
          owner_id: string | null
          team_lead_id: string | null
          template_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          owner_id?: string | null
          team_lead_id?: string | null
          template_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          owner_id?: string | null
          team_lead_id?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_strategies: {
        Row: {
          competence_id: number | null
          description: string
          id: number
        }
        Insert: {
          competence_id?: number | null
          description: string
          id?: never
        }
        Update: {
          competence_id?: number | null
          description?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "learning_strategies_competence_id_fkey"
            columns: ["competence_id"]
            isOneToOne: false
            referencedRelation: "competences"
            referencedColumns: ["id"]
          },
        ]
      }
      mandatory_courses: {
        Row: {
          assessment_method: string | null
          content: string | null
          duration: string | null
          form: string | null
          goal: string | null
          id: number
          name: string
          training_document_id: number | null
        }
        Insert: {
          assessment_method?: string | null
          content?: string | null
          duration?: string | null
          form?: string | null
          goal?: string | null
          id?: never
          name: string
          training_document_id?: number | null
        }
        Update: {
          assessment_method?: string | null
          content?: string | null
          duration?: string | null
          form?: string | null
          goal?: string | null
          id?: never
          name?: string
          training_document_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mandatory_courses_training_document_id_fkey"
            columns: ["training_document_id"]
            isOneToOne: false
            referencedRelation: "training_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      specialer: {
        Row: {
          created_at: string
          id: number
          Specialenavn: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          Specialenavn?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          Specialenavn?: string | null
        }
        Relationships: []
      }
      specialty_collaborations: {
        Row: {
          collaborator_document_id: string
          created_at: string
          description: string
          document_id: string
          id: string
          updated_at: string
        }
        Insert: {
          collaborator_document_id: string
          created_at?: string
          description: string
          document_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          collaborator_document_id?: string
          created_at?: string
          description?: string
          document_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "specialty_collaborations_collaborator_document_id_fkey"
            columns: ["collaborator_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specialty_collaborations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      template_sections: {
        Row: {
          allows_list: boolean
          description: string | null
          id: string
          level: number
          name: string
          position: number
          template_id: string | null
        }
        Insert: {
          allows_list?: boolean
          description?: string | null
          id?: string
          level?: number
          name: string
          position: number
          template_id?: string | null
        }
        Update: {
          allows_list?: boolean
          description?: string | null
          id?: string
          level?: number
          name?: string
          position?: number
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      training_documents: {
        Row: {
          created_at: string | null
          id: number
          introduction: string | null
          specialty: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          introduction?: string | null
          specialty: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: never
          introduction?: string | null
          specialty?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          document_id: string
          id: string
          section_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          document_id: string
          id?: string
          section_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          document_id?: string
          id?: string
          section_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_team_lead: {
        Args: { doc_id: string; user_id: string }
        Returns: boolean
      }
      check_user_role: {
        Args: { required_role: string; user_id: string }
        Returns: boolean
      }
      count_documents_containing: {
        Args: { search_term: string }
        Returns: number
      }
      get_document_text: {
        Args: { doc_id: string }
        Returns: {
          body: string
          section_title: string
          title: string
        }[]
      }
      search_documents: {
        Args: { search_term: string }
        Returns: {
          document_id: string
          matches: number
          title: string
        }[]
      }
      tiptap_to_text: { Args: { doc: Json }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
