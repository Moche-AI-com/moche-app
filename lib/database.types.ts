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
      ai_usage: {
        Row: {
          cache_hit: boolean
          completion_tokens: number
          created_at: string
          embed_tokens: number
          est_cost_usd: number
          id: string
          kind: string
          latency_ms: number | null
          model: string
          prompt_tokens: number
          property_id: string | null
          source: string | null
          total_tokens: number
        }
        Insert: {
          cache_hit?: boolean
          completion_tokens?: number
          created_at?: string
          embed_tokens?: number
          est_cost_usd?: number
          id?: string
          kind: string
          latency_ms?: number | null
          model: string
          prompt_tokens?: number
          property_id?: string | null
          source?: string | null
        }
        Update: {
          cache_hit?: boolean
          completion_tokens?: number
          created_at?: string
          embed_tokens?: number
          est_cost_usd?: number
          id?: string
          kind?: string
          latency_ms?: number | null
          model?: string
          prompt_tokens?: number
          property_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_profile_id: string | null
          actor_type: string
          created_at: string
          host_account_id: string | null
          id: string
          ip_hash: string | null
          metadata: Json | null
          property_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          actor_type?: string
          created_at?: string
          host_account_id?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          property_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          actor_type?: string
          created_at?: string
          host_account_id?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          property_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_host_account_id_fkey"
            columns: ["host_account_id"]
            isOneToOne: false
            referencedRelation: "host_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_items: {
        Row: {
          body: string | null
          category: Database["public"]["Enums"]["brain_category"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          ingestion_error: string | null
          property_id: string
          source_type: Database["public"]["Enums"]["source_type"]
          status: Database["public"]["Enums"]["processing_status"]
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["brain_visibility"]
        }
        Insert: {
          body?: string | null
          category: Database["public"]["Enums"]["brain_category"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          ingestion_error?: string | null
          property_id: string
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["processing_status"]
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["brain_visibility"]
        }
        Update: {
          body?: string | null
          category?: Database["public"]["Enums"]["brain_category"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          ingestion_error?: string | null
          property_id?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["processing_status"]
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["brain_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "brain_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          ip_hash: string | null
          kind: Database["public"]["Enums"]["consent_kind"]
          profile_id: string | null
          stay_id: string | null
        }
        Insert: {
          created_at?: string
          granted: boolean
          id?: string
          ip_hash?: string | null
          kind: Database["public"]["Enums"]["consent_kind"]
          profile_id?: string | null
          stay_id?: string | null
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          ip_hash?: string | null
          kind?: Database["public"]["Enums"]["consent_kind"]
          profile_id?: string | null
          stay_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          property_id: string
          stay_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          stay_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          stay_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          brain_item_id: string | null
          category: Database["public"]["Enums"]["brain_category"]
          chunk_index: number
          content: string
          created_at: string
          document_id: string | null
          embedding: string | null
          id: string
          property_id: string
          token_count: number | null
          visibility: Database["public"]["Enums"]["brain_visibility"]
        }
        Insert: {
          brain_item_id?: string | null
          category?: Database["public"]["Enums"]["brain_category"]
          chunk_index?: number
          content: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          property_id: string
          token_count?: number | null
          visibility?: Database["public"]["Enums"]["brain_visibility"]
        }
        Update: {
          brain_item_id?: string | null
          category?: Database["public"]["Enums"]["brain_category"]
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          property_id?: string
          token_count?: number | null
          visibility?: Database["public"]["Enums"]["brain_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_brain_item_id_fkey"
            columns: ["brain_item_id"]
            isOneToOne: false
            referencedRelation: "brain_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          brain_item_id: string | null
          created_at: string
          deleted_at: string | null
          error_detail: string | null
          file_name: string
          id: string
          mime_type: string
          property_id: string
          size_bytes: number
          status: Database["public"]["Enums"]["processing_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          visibility: Database["public"]["Enums"]["brain_visibility"]
        }
        Insert: {
          brain_item_id?: string | null
          created_at?: string
          deleted_at?: string | null
          error_detail?: string | null
          file_name: string
          id?: string
          mime_type: string
          property_id: string
          size_bytes: number
          status?: Database["public"]["Enums"]["processing_status"]
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["brain_visibility"]
        }
        Update: {
          brain_item_id?: string | null
          created_at?: string
          deleted_at?: string | null
          error_detail?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          property_id?: string
          size_bytes?: number
          status?: Database["public"]["Enums"]["processing_status"]
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["brain_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "documents_brain_item_id_fkey"
            columns: ["brain_item_id"]
            isOneToOne: false
            referencedRelation: "brain_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          conversation_id: string | null
          converted_brain_item_id: string | null
          created_at: string
          host_response: string | null
          id: string
          property_id: string
          question: string
          responded_at: string | null
          responded_by: string | null
          status: Database["public"]["Enums"]["escalation_status"]
          stay_id: string | null
          updated_at: string
        }
        Insert: {
          conversation_id?: string | null
          converted_brain_item_id?: string | null
          created_at?: string
          host_response?: string | null
          id?: string
          property_id: string
          question: string
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["escalation_status"]
          stay_id?: string | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string | null
          converted_brain_item_id?: string | null
          created_at?: string
          host_response?: string | null
          id?: string
          property_id?: string
          question?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["escalation_status"]
          stay_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_converted_brain_item_id_fkey"
            columns: ["converted_brain_item_id"]
            isOneToOne: false
            referencedRelation: "brain_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_access_links: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          max_redemptions: number
          property_id: string
          redemption_count: number
          require_otp: boolean
          revoked_at: string | null
          stay_id: string | null
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          max_redemptions?: number
          property_id: string
          redemption_count?: number
          require_otp?: boolean
          revoked_at?: string | null
          stay_id?: string | null
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          max_redemptions?: number
          property_id?: string
          redemption_count?: number
          require_otp?: boolean
          revoked_at?: string | null
          stay_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_access_links_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_access_links_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_access_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_hash: string | null
          property_id: string
          revoked_at: string | null
          session_token_hash: string
          status: Database["public"]["Enums"]["access_status"]
          stay_id: string
          user_agent: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          ip_hash?: string | null
          property_id: string
          revoked_at?: string | null
          session_token_hash: string
          status?: Database["public"]["Enums"]["access_status"]
          stay_id: string
          user_agent?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          property_id?: string
          revoked_at?: string | null
          session_token_hash?: string
          status?: Database["public"]["Enums"]["access_status"]
          stay_id?: string
          user_agent?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_access_sessions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_access_sessions_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_identities: {
        Row: {
          contact_hash: string
          contact_last4: string | null
          contact_type: string
          created_at: string
          display_name: string | null
          id: string
          property_id: string
        }
        Insert: {
          contact_hash: string
          contact_last4?: string | null
          contact_type?: string
          created_at?: string
          display_name?: string | null
          id?: string
          property_id: string
        }
        Update: {
          contact_hash?: string
          contact_last4?: string | null
          contact_type?: string
          created_at?: string
          display_name?: string | null
          id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_identities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_verifications: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          contact_hash: string
          created_at: string
          expires_at: string
          id: string
          max_attempts: number
          property_id: string
          stay_id: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          contact_hash: string
          created_at?: string
          expires_at: string
          id?: string
          max_attempts?: number
          property_id: string
          stay_id?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          contact_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          property_id?: string
          stay_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_verifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_verifications_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      host_accounts: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          owner_id: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          kind: Database["public"]["Enums"]["ingestion_kind"]
          last_error: string | null
          property_id: string
          result: Json | null
          source_url: string | null
          status: Database["public"]["Enums"]["processing_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ingestion_kind"]
          last_error?: string | null
          property_id: string
          result?: Json | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["processing_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ingestion_kind"]
          last_error?: string | null
          property_id?: string
          result?: Json | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["processing_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      message_feedback: {
        Row: {
          created_at: string
          id: string
          message_id: string
          property_id: string
          value: Database["public"]["Enums"]["feedback_value"]
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          property_id: string
          value: Database["public"]["Enums"]["feedback_value"]
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          property_id?: string
          value?: Database["public"]["Enums"]["feedback_value"]
        }
        Relationships: [
          {
            foreignKeyName: "message_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_feedback_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_profile_id: string | null
          confidence: number | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          intent: Database["public"]["Enums"]["intent_type"] | null
          latency_ms: number | null
          model: string | null
          property_id: string
          role: Database["public"]["Enums"]["conversation_role"]
          sources: Json | null
        }
        Insert: {
          author_profile_id?: string | null
          confidence?: number | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          intent?: Database["public"]["Enums"]["intent_type"] | null
          latency_ms?: number | null
          model?: string | null
          property_id: string
          role: Database["public"]["Enums"]["conversation_role"]
          sources?: Json | null
        }
        Update: {
          author_profile_id?: string | null
          confidence?: number | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          intent?: Database["public"]["Enums"]["intent_type"] | null
          latency_ms?: number | null
          model?: string | null
          property_id?: string
          role?: Database["public"]["Enums"]["conversation_role"]
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          host_account_id: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string | null
          property_id: string | null
          read_at: string | null
          recipient_profile_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          host_account_id: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          property_id?: string | null
          read_at?: string | null
          recipient_profile_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          host_account_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          property_id?: string | null
          read_at?: string | null
          recipient_profile_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_host_account_id_fkey"
            columns: ["host_account_id"]
            isOneToOne: false
            referencedRelation: "host_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          host_account_id: string
          id: string
          invited_email: string | null
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          host_account_id: string
          id?: string
          invited_email?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          host_account_id?: string
          id?: string
          invited_email?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_host_account_id_fkey"
            columns: ["host_account_id"]
            isOneToOne: false
            referencedRelation: "host_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deletion_requested_at: string | null
          email: string
          full_name: string | null
          id: string
          is_admin: boolean
          mfa_ready: boolean
          phone: string | null
          privacy_accepted_at: string | null
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_admin?: boolean
          mfa_ready?: boolean
          phone?: string | null
          privacy_accepted_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
          mfa_ready?: boolean
          phone?: string | null
          privacy_accepted_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          brand_accent: string | null
          brand_primary: string | null
          city: string | null
          country: string | null
          cover_image_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          host_account_id: string
          id: string
          locale: string
          logo_url: string | null
          postal_code: string | null
          published_at: string | null
          region: string | null
          slug: string
          status: Database["public"]["Enums"]["property_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          brand_accent?: string | null
          brand_primary?: string | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          host_account_id: string
          id?: string
          locale?: string
          logo_url?: string | null
          postal_code?: string | null
          published_at?: string | null
          region?: string | null
          slug: string
          status?: Database["public"]["Enums"]["property_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          brand_accent?: string | null
          brand_primary?: string | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          host_account_id?: string
          id?: string
          locale?: string
          logo_url?: string | null
          postal_code?: string | null
          published_at?: string | null
          region?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["property_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_host_account_id_fkey"
            columns: ["host_account_id"]
            isOneToOne: false
            referencedRelation: "host_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      property_contacts: {
        Row: {
          contact_type: string
          created_at: string
          email: string | null
          id: string
          is_emergency: boolean
          is_primary: boolean
          label: string
          name: string | null
          phone: string | null
          property_id: string
        }
        Insert: {
          contact_type?: string
          created_at?: string
          email?: string | null
          id?: string
          is_emergency?: boolean
          is_primary?: boolean
          label: string
          name?: string | null
          phone?: string | null
          property_id: string
        }
        Update: {
          contact_type?: string
          created_at?: string
          email?: string | null
          id?: string
          is_emergency?: boolean
          is_primary?: boolean
          label?: string
          name?: string | null
          phone?: string | null
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_members: {
        Row: {
          can_edit_brain: boolean
          can_receive_escalations: boolean
          can_reply_guests: boolean
          can_resolve_maintenance: boolean
          can_view_analytics: boolean
          created_at: string
          id: string
          profile_id: string
          property_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          can_edit_brain?: boolean
          can_receive_escalations?: boolean
          can_reply_guests?: boolean
          can_resolve_maintenance?: boolean
          can_view_analytics?: boolean
          created_at?: string
          id?: string
          profile_id: string
          property_id: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          can_edit_brain?: boolean
          can_receive_escalations?: boolean
          can_reply_guests?: boolean
          can_resolve_maintenance?: boolean
          can_view_analytics?: boolean
          created_at?: string
          id?: string
          profile_id?: string
          property_id?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "property_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_settings: {
        Row: {
          ai_temperature: number
          concierge_tone: string
          confidence_threshold: number
          grace_period_hours: number
          modules: Json
          property_id: string
          review_nudge_auto: boolean
          review_nudge_enabled: boolean
          updated_at: string
        }
        Insert: {
          ai_temperature?: number
          concierge_tone?: string
          confidence_threshold?: number
          grace_period_hours?: number
          modules?: Json
          property_id: string
          review_nudge_auto?: boolean
          review_nudge_enabled?: boolean
          updated_at?: string
        }
        Update: {
          ai_temperature?: number
          concierge_tone?: string
          confidence_threshold?: number
          grace_period_hours?: number
          modules?: Json
          property_id?: string
          review_nudge_auto?: boolean
          review_nudge_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_settings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          distance_note: string | null
          id: string
          name: string
          property_id: string
          url: string | null
          visibility: Database["public"]["Enums"]["brain_visibility"]
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          distance_note?: string | null
          id?: string
          name: string
          property_id: string
          url?: string | null
          visibility?: Database["public"]["Enums"]["brain_visibility"]
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          distance_note?: string | null
          id?: string
          name?: string
          property_id?: string
          url?: string | null
          visibility?: Database["public"]["Enums"]["brain_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          assigned_contact_id: string | null
          conversation_id: string | null
          created_at: string
          description: string
          id: string
          property_id: string
          resolution_notes: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["service_status"]
          stay_id: string | null
          timeline: Json
          updated_at: string
          urgency: Database["public"]["Enums"]["urgency_level"]
        }
        Insert: {
          assigned_contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description: string
          id?: string
          property_id: string
          resolution_notes?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["service_status"]
          stay_id?: string | null
          timeline?: Json
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency_level"]
        }
        Update: {
          assigned_contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string
          id?: string
          property_id?: string
          resolution_notes?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["service_status"]
          stay_id?: string | null
          timeline?: Json
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency_level"]
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_assigned_contact_id_fkey"
            columns: ["assigned_contact_id"]
            isOneToOne: false
            referencedRelation: "property_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      stays: {
        Row: {
          booking_reference: string | null
          check_in: string
          check_out: string
          contact_hash: string
          contact_last4: string | null
          contact_type: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          guest_count: number
          guest_display_name: string
          guest_identity_id: string | null
          host_notes: string | null
          id: string
          property_id: string
          status: Database["public"]["Enums"]["stay_status"]
          updated_at: string
        }
        Insert: {
          booking_reference?: string | null
          check_in: string
          check_out: string
          contact_hash: string
          contact_last4?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          guest_count?: number
          guest_display_name: string
          guest_identity_id?: string | null
          host_notes?: string | null
          id?: string
          property_id: string
          status?: Database["public"]["Enums"]["stay_status"]
          updated_at?: string
        }
        Update: {
          booking_reference?: string | null
          check_in?: string
          check_out?: string
          contact_hash?: string
          contact_last4?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          guest_count?: number
          guest_display_name?: string
          guest_identity_id?: string | null
          host_notes?: string | null
          id?: string
          property_id?: string
          status?: Database["public"]["Enums"]["stay_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_guest_identity_id_fkey"
            columns: ["guest_identity_id"]
            isOneToOne: false
            referencedRelation: "guest_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          id: string
          payload: Json | null
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          payload?: Json | null
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          host_account_id: string
          id: string
          plan: string | null
          quantity: number
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          host_account_id: string
          id?: string
          plan?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          host_account_id?: string
          id?: string
          plan?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_host_account_id_fkey"
            columns: ["host_account_id"]
            isOneToOne: true
            referencedRelation: "host_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_property: { Args: { prop: string }; Returns: boolean }
      can_edit_property: { Args: { prop: string }; Returns: boolean }
      is_account_member: { Args: { acc: string }; Returns: boolean }
      is_account_owner: { Args: { acc: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      match_property_chunks: {
        Args: {
          p_guest_only?: boolean
          p_match_count?: number
          p_property_id: string
          p_query_embedding: string
        }
        Returns: {
          brain_item_id: string
          category: Database["public"]["Enums"]["brain_category"]
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
      property_account: { Args: { prop: string }; Returns: string }
    }
    Enums: {
      access_status: "pending" | "verified" | "expired" | "revoked"
      brain_category:
        | "core"
        | "appliances"
        | "house_rules"
        | "checkin_checkout"
        | "local_recommendations"
        | "emergency"
        | "documents"
        | "product_urls"
        | "host_qa"
        | "internal_notes"
        | "transportation"
      brain_visibility: "guest" | "internal"
      consent_kind: "terms" | "privacy" | "marketing" | "guest_comms"
      conversation_role: "guest" | "assistant" | "host" | "system"
      escalation_status: "open" | "answered" | "resolved" | "dismissed"
      feedback_value: "helpful" | "not_helpful"
      ingestion_kind: "document" | "url"
      intent_type:
        | "information"
        | "wifi"
        | "checkin"
        | "checkout"
        | "parking"
        | "appliance"
        | "house_rules"
        | "local"
        | "maintenance"
        | "cleaning"
        | "safety"
        | "emergency"
        | "other"
      member_role: "owner" | "co_host"
      notification_kind:
        | "escalation"
        | "maintenance"
        | "ingestion_failure"
        | "billing"
        | "review_nudge"
        | "system"
      processing_status: "pending" | "processing" | "ready" | "failed" | "stale"
      property_status: "draft" | "live" | "paused" | "archived"
      service_status:
        | "new"
        | "acknowledged"
        | "in_progress"
        | "waiting_on_guest"
        | "resolved"
        | "closed"
      service_type:
        | "information"
        | "maintenance"
        | "cleaning"
        | "safety"
        | "emergency"
        | "other"
      source_type: "manual_entry" | "document" | "url" | "host_qa" | "clone"
      stay_status: "upcoming" | "active" | "completed" | "revoked"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "paused"
      urgency_level: "low" | "medium" | "high" | "critical"
      user_role: "host_owner" | "co_host" | "admin"
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
    Enums: {
      access_status: ["pending", "verified", "expired", "revoked"],
      brain_category: [
        "core",
        "appliances",
        "house_rules",
        "checkin_checkout",
        "local_recommendations",
        "emergency",
        "documents",
        "product_urls",
        "host_qa",
        "internal_notes",
        "transportation",
      ],
      brain_visibility: ["guest", "internal"],
      consent_kind: ["terms", "privacy", "marketing", "guest_comms"],
      conversation_role: ["guest", "assistant", "host", "system"],
      escalation_status: ["open", "answered", "resolved", "dismissed"],
      feedback_value: ["helpful", "not_helpful"],
      ingestion_kind: ["document", "url"],
      intent_type: [
        "information",
        "wifi",
        "checkin",
        "checkout",
        "parking",
        "appliance",
        "house_rules",
        "local",
        "maintenance",
        "cleaning",
        "safety",
        "emergency",
        "other",
      ],
      member_role: ["owner", "co_host"],
      notification_kind: [
        "escalation",
        "maintenance",
        "ingestion_failure",
        "billing",
        "review_nudge",
        "system",
      ],
      processing_status: ["pending", "processing", "ready", "failed", "stale"],
      property_status: ["draft", "live", "paused", "archived"],
      service_status: [
        "new",
        "acknowledged",
        "in_progress",
        "waiting_on_guest",
        "resolved",
        "closed",
      ],
      service_type: [
        "information",
        "maintenance",
        "cleaning",
        "safety",
        "emergency",
        "other",
      ],
      source_type: ["manual_entry", "document", "url", "host_qa", "clone"],
      stay_status: ["upcoming", "active", "completed", "revoked"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
        "paused",
      ],
      urgency_level: ["low", "medium", "high", "critical"],
      user_role: ["host_owner", "co_host", "admin"],
    },
  },
} as const
