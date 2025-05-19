export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
