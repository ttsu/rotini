export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      rota_invites: {
        Row: {
          code: string
          consumed_at: string | null
          consumed_by: string | null
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          role: string
          rota_id: string
        }
        Insert: {
          code: string
          consumed_at?: string | null
          consumed_by?: string | null
          email?: string | null
          expires_at: string
          id?: string
          invited_by: string
          role: string
          rota_id: string
        }
        Update: {
          code?: string
          consumed_at?: string | null
          consumed_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          rota_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rota_invites_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_invites_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      rota_members: {
        Row: {
          joined_at: string
          position: number | null
          role: string
          rota_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          position?: number | null
          role: string
          rota_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          position?: number | null
          role?: string
          rota_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rota_members_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rotas: {
        Row: {
          archived_at: string | null
          assignment_mode: string
          created_at: string
          cursor_user_id: string | null
          description: string | null
          dtstart: string | null
          duration_minutes: number | null
          fixed_default: Json | null
          id: string
          name: string
          owner_id: string
          rrule: string | null
          tz: string
        }
        Insert: {
          archived_at?: string | null
          assignment_mode: string
          created_at?: string
          cursor_user_id?: string | null
          description?: string | null
          dtstart?: string | null
          duration_minutes?: number | null
          fixed_default?: Json | null
          id?: string
          name: string
          owner_id: string
          rrule?: string | null
          tz: string
        }
        Update: {
          archived_at?: string | null
          assignment_mode?: string
          created_at?: string
          cursor_user_id?: string | null
          description?: string | null
          dtstart?: string | null
          duration_minutes?: number | null
          fixed_default?: Json | null
          id?: string
          name?: string
          owner_id?: string
          rrule?: string | null
          tz?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotas_cursor_user_id_fkey"
            columns: ["cursor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { p_code: string }
        Returns: {
          joined_at: string
          position: number | null
          role: string
          rota_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rota_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_member_role: {
        Args: { p_new_role: string; p_rota_id: string; p_user_id: string }
        Returns: {
          joined_at: string
          position: number | null
          role: string
          rota_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rota_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_invite: {
        Args: { p_email?: string; p_role: string; p_rota_id: string }
        Returns: {
          code: string
          consumed_at: string | null
          consumed_by: string | null
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          role: string
          rota_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rota_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_rota_member: { Args: { p_rota_id: string }; Returns: boolean }
      is_rota_owner: { Args: { p_rota_id: string }; Returns: boolean }
      leave_rota: { Args: { p_rota_id: string }; Returns: undefined }
      lookup_invite: {
        Args: { p_code: string }
        Returns: {
          role: string
          rota_id: string
          rota_name: string
        }[]
      }
      remove_member: {
        Args: { p_rota_id: string; p_user_id: string }
        Returns: undefined
      }
      transfer_ownership: {
        Args: { p_new_owner_id: string; p_rota_id: string }
        Returns: undefined
      }
      users_share_rota: { Args: { a: string; b: string }; Returns: boolean }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

