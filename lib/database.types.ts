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
      extras_orders: {
        Row: {
          archived_at: string | null
          conversation_id: string | null
          created_at: string
          declined_reason: string | null
          escalation_id: string | null
          expires_at: string | null
          extra_id: string | null
          fulfillment_status: Database["public"]["Enums"]["extras_fulfillment_status"]
          guest_identity_id: string | null
          guest_note: string | null
          guest_session_id: string | null
          host_conversation_id: string | null
          host_note: string | null
          id: string
          item_price_text: string | null
          item_title: string
          item_variant: string | null
          lifecycle_status:
            | Database["public"]["Enums"]["lifecycle_state"]
            | null
          payment_mode: string
          property_id: string
          quantity: number
          quote_currency: string
          quoted_amount_cents: number | null
          request_number: string
          scheduled_for: string | null
          status: Database["public"]["Enums"]["extras_order_status"]
          stay_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          conversation_id?: string | null
          created_at?: string
          declined_reason?: string | null
          escalation_id?: string | null
          expires_at?: string | null
          extra_id?: string | null
          fulfillment_status?: Database["public"]["Enums"]["extras_fulfillment_status"]
          guest_identity_id?: string | null
          guest_note?: string | null
          guest_session_id?: string | null
          host_conversation_id?: string | null
          host_note?: string | null
          id?: string
          item_price_text?: string | null
          item_title: string
          item_variant?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["lifecycle_state"]
            | null
          payment_mode?: string
          property_id: string
          quantity?: number
          quote_currency?: string
          quoted_amount_cents?: number | null
          request_number?: string
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["extras_order_status"]
          stay_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          conversation_id?: string | null
          created_at?: string
          declined_reason?: string | null
          escalation_id?: string | null
          expires_at?: string | null
          extra_id?: string | null
          fulfillment_status?: Database["public"]["Enums"]["extras_fulfillment_status"]
          guest_identity_id?: string | null
          guest_note?: string | null
          guest_session_id?: string | null
          host_conversation_id?: string | null
          host_note?: string | null
          id?: string
          item_price_text?: string | null
          item_title?: string
          item_variant?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["lifecycle_state"]
            | null
          payment_mode?: string
          property_id?: string
          quantity?: number
          quote_currency?: string
          quoted_amount_cents?: number | null
          request_number?: string
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["extras_order_status"]
          stay_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extras_orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_orders_escalation_id_fkey"
            columns: ["escalation_id"]
            isOneToOne: false
            referencedRelation: "escalations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_orders_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "guest_extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_orders_guest_identity_id_fkey"
            columns: ["guest_identity_id"]
            isOneToOne: false
            referencedRelation: "guest_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_orders_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_access_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_orders_host_conversation_id_fkey"
            columns: ["host_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_orders_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      notification_kind:
        | "escalation"
        | "maintenance"
        | "ingestion_failure"
        | "billing"
        | "review_nudge"
        | "system"
        | "extras"
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
      notification_kind: [
        "escalation",
        "maintenance",
        "ingestion_failure",
        "billing",
        "review_nudge",
        "system",
        "extras",
      ],
    },
  },
} as const
