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
      notification_jobs: {
        Row: {
          created_at: string
          fire_at: string
          id: string
          occurrence_id: string
          reminder_id: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fire_at: string
          id?: string
          occurrence_id: string
          reminder_id: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fire_at?: string
          id?: string
          occurrence_id?: string
          reminder_id?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_jobs_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["active_occurrence_id"]
          },
          {
            foreignKeyName: "notification_jobs_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["upcoming_occurrence_id"]
          },
          {
            foreignKeyName: "notification_jobs_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "user_rota_reminders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          slot_member_id: string | null
          status: string
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
          slot_member_id?: string | null
          status?: string
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
          slot_member_id?: string | null
          status?: string
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
            foreignKeyName: "occurrences_slot_member_id_fkey"
            columns: ["slot_member_id"]
            isOneToOne: false
            referencedRelation: "rota_members"
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
      push_tokens: {
        Row: {
          expo_token: string
          last_seen_at: string
          platform: string
          user_id: string
        }
        Insert: {
          expo_token: string
          last_seen_at?: string
          platform: string
          user_id: string
        }
        Update: {
          expo_token?: string
          last_seen_at?: string
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          is_manager: boolean
          phone_e164: string | null
          role: string
          rota_id: string
          slot_id: string | null
          sms_sent_at: string | null
        }
        Insert: {
          code: string
          consumed_at?: string | null
          consumed_by?: string | null
          email?: string | null
          expires_at: string
          id?: string
          invited_by: string
          is_manager?: boolean
          phone_e164?: string | null
          role: string
          rota_id: string
          slot_id?: string | null
          sms_sent_at?: string | null
        }
        Update: {
          code?: string
          consumed_at?: string | null
          consumed_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          is_manager?: boolean
          phone_e164?: string | null
          role?: string
          rota_id?: string
          slot_id?: string | null
          sms_sent_at?: string | null
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
          {
            foreignKeyName: "rota_invites_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "rota_members"
            referencedColumns: ["id"]
          },
        ]
      }
      rota_materialization_errors: {
        Row: {
          created_at: string
          details: Json
          error_message: string
          id: string
          request_id: number | null
          rota_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          error_message: string
          id?: string
          request_id?: number | null
          rota_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          error_message?: string
          id?: string
          request_id?: number | null
          rota_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rota_materialization_errors_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_materialization_errors_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["rota_id"]
          },
        ]
      }
      rota_materialization_requests: {
        Row: {
          checked_at: string | null
          id: string
          request_id: number
          requested_at: string
          rota_id: string
        }
        Insert: {
          checked_at?: string | null
          id?: string
          request_id: number
          requested_at?: string
          rota_id: string
        }
        Update: {
          checked_at?: string | null
          id?: string
          request_id?: number
          requested_at?: string
          rota_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rota_materialization_requests_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_materialization_requests_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["rota_id"]
          },
        ]
      }
      rota_members: {
        Row: {
          id: string
          is_manager: boolean
          joined_at: string
          label: string | null
          notify_scope: string
          position: number | null
          role: string
          rota_id: string
          user_id: string | null
        }
        Insert: {
          id?: string
          is_manager?: boolean
          joined_at?: string
          label?: string | null
          notify_scope?: string
          position?: number | null
          role: string
          rota_id: string
          user_id?: string | null
        }
        Update: {
          id?: string
          is_manager?: boolean
          joined_at?: string
          label?: string | null
          notify_scope?: string
          position?: number | null
          role?: string
          rota_id?: string
          user_id?: string | null
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
          cursor_member_id: string | null
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
          cursor_member_id?: string | null
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
          cursor_member_id?: string | null
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
            foreignKeyName: "rotas_cursor_member_id_fkey"
            columns: ["cursor_member_id"]
            isOneToOne: false
            referencedRelation: "rota_members"
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
          kind: string
          message: string | null
          occurrence_id: string
          requester_id: string
          status: string
          target_user_id: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          occurrence_id: string
          requester_id: string
          status?: string
          target_user_id?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          occurrence_id?: string
          requester_id?: string
          status?: string
          target_user_id?: string | null
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
      user_rota_reminders: {
        Row: {
          id: string
          lead_minutes: number
          rota_id: string
          user_id: string
        }
        Insert: {
          id?: string
          lead_minutes: number
          rota_id: string
          user_id: string
        }
        Update: {
          id?: string
          lead_minutes?: number
          rota_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_rota_reminders_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rota_reminders_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "v_rota_now"
            referencedColumns: ["rota_id"]
          },
          {
            foreignKeyName: "user_rota_reminders_rota_id_user_id_fkey"
            columns: ["rota_id", "user_id"]
            isOneToOne: true
            referencedRelation: "rota_members"
            referencedColumns: ["rota_id", "user_id"]
          },
          {
            foreignKeyName: "user_rota_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rota_share_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          last_accessed_at: string | null
          rota_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          rota_id: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          rota_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "rota_share_links_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_unavailability: {
        Row: {
          created_at: string
          end_date: string
          id: string
          reason: string | null
          start_date: string
          tz: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          tz: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          tz?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unavailability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_unavailability_public: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string | null
          start_date: string | null
          tz: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_unavailability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_rota_now: {
        Row: {
          active_assignee_display: string | null
          active_assignee_id: string | null
          active_assignee_name: string | null
          active_ends_at: string | null
          active_occurrence_id: string | null
          active_scheduled_at: string | null
          rota_id: string | null
          upcoming_assignee_display: string | null
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
      _compact_membership: {
        Args: { p_removed_id: string; p_removed_pos: number; p_rota_id: string }
        Returns: undefined
      }
      _unavailability_upsert_merged: {
        Args: {
          p_end_date: string
          p_id: string
          p_reason: string
          p_start_date: string
          p_tz: string
        }
        Returns: Json
      }
      accept_invite: {
        Args: { p_code: string }
        Returns: {
          id: string
          is_manager: boolean
          joined_at: string
          label: string | null
          notify_scope: string
          position: number | null
          role: string
          rota_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rota_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_pending_member: {
        Args: { p_label?: string; p_role: string; p_rota_id: string }
        Returns: string
      }
      cancel_swap: { Args: { p_swap_request_id: string }; Returns: undefined }
      change_member_role: {
        Args: { p_new_role: string; p_rota_id: string; p_user_id: string }
        Returns: {
          id: string
          is_manager: boolean
          joined_at: string
          label: string | null
          notify_scope: string
          position: number | null
          role: string
          rota_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rota_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_share_link: {
        Args: { p_rota_id: string; p_expires_at?: string | null }
        Returns: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          last_accessed_at: string | null
          rota_id: string
          revoked_at: string | null
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "rota_share_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_coverage: {
        Args: { p_swap_request_id: string }
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
          slot_member_id: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "occurrences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_notification_jobs: {
        Args: { p_limit?: number }
        Returns: {
          assignee_name: string
          expo_token: string
          fire_at: string
          id: string
          lead_minutes: number
          occurrence_id: string
          reminder_id: string
          rota_name: string
          user_id: string
        }[]
      }
      claim_pending_slot: {
        Args: { p_occurrence_id: string }
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
          slot_member_id: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "occurrences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clear_unavailability: {
        Args: { p_unavailability_id: string }
        Returns: Json
      }
      create_invite: {
        Args: {
          p_email?: string
          p_phone?: string
          p_role: string
          p_rota_id: string
        }
        Returns: {
          code: string
          consumed_at: string | null
          consumed_by: string | null
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          is_manager: boolean
          phone_e164: string | null
          role: string
          rota_id: string
          slot_id: string | null
          sms_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rota_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_rota: { Args: { p_rota_id: string }; Returns: undefined }
      dispatch_notifications: { Args: never; Returns: number }
      is_rota_manager: { Args: { p_rota_id: string }; Returns: boolean }
      is_rota_member: { Args: { p_rota_id: string }; Returns: boolean }
      is_rota_owner: { Args: { p_rota_id: string }; Returns: boolean }
      leave_rota: { Args: { p_rota_id: string }; Returns: undefined }
      lookup_auth_user_id_for_invite: {
        Args: { p_email: string; p_phone: string }
        Returns: string
      }
      lookup_invite: {
        Args: { p_code: string }
        Returns: {
          role: string
          rota_id: string
          rota_name: string
        }[]
      }
      materialize_active_rotas: { Args: never; Returns: Json }
      materialize_rota: { Args: { p_rota_id: string }; Returns: number }
      materialize_rota_apply: {
        Args: {
          p_new_cursor_member_id: string
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
          slot_member_id: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "occurrences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reconcile_notifications_for_rota: {
        Args: { p_rota_id: string }
        Returns: undefined
      }
      record_rota_materialization_http_errors: { Args: never; Returns: number }
      remove_member: {
        Args: { p_rota_id: string; p_user_id: string }
        Returns: undefined
      }
      remove_pending_member: {
        Args: { p_member_id: string; p_rota_id: string }
        Returns: undefined
      }
      reorder_members: {
        Args: {
          p_cutoff_at: string
          p_ordered_member_ids: string[]
          p_rota_id: string
        }
        Returns: undefined
      }
      request_coverage: {
        Args: { p_message?: string; p_occurrence_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          id: string
          kind: string
          message: string | null
          occurrence_id: string
          requester_id: string
          status: string
          target_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "swap_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_swap: {
        Args: {
          p_message?: string
          p_occurrence_id: string
          p_target_user_id?: string
        }
        Returns: {
          created_at: string
          decided_at: string | null
          id: string
          kind: string
          message: string | null
          occurrence_id: string
          requester_id: string
          status: string
          target_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "swap_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_shared_rota: {
        Args: { p_token: string }
        Returns: Json
      }
      revoke_share_link: { Args: { p_link_id: string }; Returns: undefined }
      reshare_pending_invite: {
        Args: { p_member_id: string; p_rota_id: string }
        Returns: string
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
          slot_member_id: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "occurrences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_manager_flag: {
        Args: { p_is_manager: boolean; p_rota_id: string; p_user_id: string }
        Returns: {
          id: string
          is_manager: boolean
          joined_at: string
          label: string | null
          notify_scope: string
          position: number | null
          role: string
          rota_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rota_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_notify_scope: {
        Args: { p_rota_id: string; p_scope: string }
        Returns: undefined
      }
      set_unavailability: {
        Args: {
          p_end_date: string
          p_reason?: string
          p_start_date: string
          p_tz?: string
        }
        Returns: Json
      }
      set_user_reminder: {
        Args: { p_lead_minutes: number; p_rota_id: string }
        Returns: undefined
      }
      transfer_ownership: {
        Args: { p_new_owner_id: string; p_rota_id: string }
        Returns: undefined
      }
      update_pending_member_label: {
        Args: { p_label: string; p_member_id: string; p_rota_id: string }
        Returns: undefined
      }
      update_unavailability: {
        Args: {
          p_end_date: string
          p_reason?: string
          p_start_date: string
          p_tz?: string
          p_unavailability_id: string
        }
        Returns: Json
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
