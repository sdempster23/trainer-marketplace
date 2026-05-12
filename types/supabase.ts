Initialising login role...
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
      dogs: {
        Row: {
          breed: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          photo_url: string | null
          temperament_notes: string | null
          updated_at: string
        }
        Insert: {
          breed?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          owner_id: string
          photo_url?: string | null
          temperament_notes?: string | null
          updated_at?: string
        }
        Update: {
          breed?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          photo_url?: string | null
          temperament_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dogs_owner_id_fkey"
            columns: ["owner_id"]
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
          deleted_at: string | null
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      trainer_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_availability_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_availability_exceptions: {
        Row: {
          created_at: string
          end_time: string | null
          exception_date: string
          id: string
          is_blocked: boolean
          reason: string | null
          start_time: string | null
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          exception_date: string
          id?: string
          is_blocked?: boolean
          reason?: string | null
          start_time?: string | null
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          exception_date?: string
          id?: string
          is_blocked?: boolean
          reason?: string | null
          start_time?: string | null
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_availability_exceptions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_certifications: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string | null
          issuer: string | null
          name: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          issuer?: string | null
          name: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          issuer?: string | null
          name?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_certifications_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_services: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price_cents: number
          session_type: Database["public"]["Enums"]["session_type"]
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          name: string
          price_cents: number
          session_type: Database["public"]["Enums"]["session_type"]
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          price_cents?: number
          session_type?: Database["public"]["Enums"]["session_type"]
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_services_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_specialty_assignments: {
        Row: {
          created_at: string
          id: string
          specialty: Database["public"]["Enums"]["trainer_specialty"]
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          specialty: Database["public"]["Enums"]["trainer_specialty"]
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          specialty?: Database["public"]["Enums"]["trainer_specialty"]
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_specialty_assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          service_point: unknown
          service_radius_meters: number | null
          timezone: string
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id: string
          service_point?: unknown
          service_radius_meters?: number | null
          timezone?: string
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          service_point?: unknown
          service_radius_meters?: number | null
          timezone?: string
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trainers_id_fkey"
            columns: ["id"]
            isOneToOne: true
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
      [_ in never]: never
    }
    Enums: {
      session_type: "in_home" | "at_trainer_location" | "virtual"
      trainer_specialty:
        | "puppy"
        | "basic_obedience"
        | "competition_obedience"
        | "behavioral"
        | "reactivity"
        | "aggression"
        | "service_dog"
        | "protection_sport_psa"
        | "protection_sport_schutzhund_igp"
        | "protection_sport_french_ring"
        | "protection_sport_mondio_ring"
        | "personal_protection"
        | "decoy_work"
        | "agility"
        | "scent_work"
        | "tracking"
        | "gun_dog"
      user_role: "owner" | "trainer" | "admin"
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
    Enums: {
      session_type: ["in_home", "at_trainer_location", "virtual"],
      trainer_specialty: [
        "puppy",
        "basic_obedience",
        "competition_obedience",
        "behavioral",
        "reactivity",
        "aggression",
        "service_dog",
        "protection_sport_psa",
        "protection_sport_schutzhund_igp",
        "protection_sport_french_ring",
        "protection_sport_mondio_ring",
        "personal_protection",
        "decoy_work",
        "agility",
        "scent_work",
        "tracking",
        "gun_dog",
      ],
      user_role: ["owner", "trainer", "admin"],
    },
  },
} as const
A new version of Supabase CLI is available: v2.98.2 (currently installed v2.90.0)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
