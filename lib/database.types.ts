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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      occurrences: {
        Row: {
          assigned_user_id: string | null
          created_at: string
          ends_at: string
          generated_from_rule: boolean
          id: string
          original_assignee_id: string | null
          override_reason: string | null
          rota_id: string
          scheduled_at: string
          scheduled_local_date: string
          status: string
          swap_request_id: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          ends_at: string
          generated_from_rule?: boolean
          id?: string
          original_assignee_id?: string | null
          override_reason?: string | null
          rota_id: string
          scheduled_at: string
          scheduled_local_date: string
          status?: string
          swap_request_id?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string
          ends_at?: string
          generated_from_rule?: boolean
          id?: string
          original_assignee_id?: string | null
          override_reason?: string | null
          rota_id?: string
          scheduled_at?: string
          scheduled_local_date?: string
          status?: string
          swap_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_original_assignee_id_fkey"
            columns: ["original_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["rota_id"]
          },
          {
            foreignKeyName: "occurrences_swap_request_id_fkey"
            columns: ["swap_request_id"]
            isOneToOne: false
            referencedRelation: "swap_requests"
            referencedColumns: ["id"]
          },
        ]
      }
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
          {
            foreignKeyName: "rota_invites_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["rota_id"]
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
            foreignKeyName: "rota_members_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["rota_id"]
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
          back_to_back: boolean
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
          back_to_back?: boolean
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
          back_to_back?: boolean
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
      swap_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          message: string | null
          occurrence_id: string
          requester_id: string
          status: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          message?: string | null
          occurrence_id: string
          requester_id: string
          status?: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          message?: string | null
          occurrence_id?: string
          requester_id?: string
          status?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_requests_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["active_occurrence_id"]
          },
          {
            foreignKeyName: "swap_requests_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["upcoming_occurrence_id"]
          },
          {
            foreignKeyName: "swap_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_rota_now: {
        Row: {
          active_assignee_id: string | null
          active_assignee_name: string | null
          active_ends_at: string | null
          active_occurrence_id: string | null
          active_scheduled_at: string | null
          rota_id: string | null
          upcoming_assignee_id: string | null
          upcoming_assignee_name: string | null
          upcoming_ends_at: string | null
          upcoming_occurrence_id: string | null
          upcoming_scheduled_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_assigned_user_id_fkey"
            columns: ["upcoming_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_assigned_user_id_fkey"
            columns: ["active_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cancel_swap: { Args: { p_swap_request_id: string }; Returns: undefined }
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
      materialize_rota: { Args: { p_rota_id: string }; Returns: number }
      materialize_rota_apply: {
        Args: {
          p_new_cursor_user_id: string
          p_occurrences: Json
          p_rota_id: string
        }
        Returns: undefined
      }
      override_occurrence: {
        Args: {
          p_new_assignee_id: string
          p_occurrence_id: string
          p_reason?: string
        }
        Returns: {
          assigned_user_id: string | null
          created_at: string
          ends_at: string
          generated_from_rule: boolean
          id: string
          original_assignee_id: string | null
          override_reason: string | null
          rota_id: string
          scheduled_at: string
          scheduled_local_date: string
          status: string
          swap_request_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "occurrences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_member: {
        Args: { p_rota_id: string; p_user_id: string }
        Returns: undefined
      }
      request_swap: {
        Args: {
          p_message?: string
          p_occurrence_id: string
          p_target_user_id: string
        }
        Returns: {
          created_at: string
          decided_at: string | null
          id: string
          message: string | null
          occurrence_id: string
          requester_id: string
          status: string
          target_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "swap_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_swap: {
        Args: { p_accept: boolean; p_swap_request_id: string }
        Returns: {
          assigned_user_id: string | null
          created_at: string
          ends_at: string
          generated_from_rule: boolean
          id: string
          original_assignee_id: string | null
          override_reason: string | null
          rota_id: string
          scheduled_at: string
          scheduled_local_date: string
          status: string
          swap_request_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "occurrences"
          isOneToOne: true
          isSetofReturn: false
        }
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
  public: {
    Enums: {},
  },
} as const
