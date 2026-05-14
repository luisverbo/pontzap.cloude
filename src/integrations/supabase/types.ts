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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      anotacoes_folguista: {
        Row: {
          company_id: string | null
          created_at: string
          data_pagamento: string | null
          data_trabalho: string
          financeiro_despesa_id: string | null
          folguista_id: string
          forma_pagamento: string | null
          id: string
          local_id: string | null
          observacao: string | null
          periodo_id: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_trabalho: string
          financeiro_despesa_id?: string | null
          folguista_id: string
          forma_pagamento?: string | null
          id?: string
          local_id?: string | null
          observacao?: string | null
          periodo_id?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_trabalho?: string
          financeiro_despesa_id?: string | null
          folguista_id?: string
          forma_pagamento?: string | null
          id?: string
          local_id?: string | null
          observacao?: string | null
          periodo_id?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "anotacoes_folguista_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anotacoes_folguista_financeiro_despesa_id_fkey"
            columns: ["financeiro_despesa_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anotacoes_folguista_folguista_id_fkey"
            columns: ["folguista_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anotacoes_folguista_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anotacoes_folguista_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "anotacoes_periodo"
            referencedColumns: ["id"]
          },
        ]
      }
      anotacoes_periodo: {
        Row: {
          company_id: string | null
          created_at: string
          financeiro_despesa_id: string | null
          folguista_id: string
          id: string
          observacao: string | null
          periodo_ano: number
          periodo_mes: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          financeiro_despesa_id?: string | null
          folguista_id: string
          id?: string
          observacao?: string | null
          periodo_ano: number
          periodo_mes: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          financeiro_despesa_id?: string | null
          folguista_id?: string
          id?: string
          observacao?: string | null
          periodo_ano?: number
          periodo_mes?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anotacoes_periodo_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anotacoes_periodo_financeiro_despesa_id_fkey"
            columns: ["financeiro_despesa_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anotacoes_periodo_folguista_id_fkey"
            columns: ["folguista_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_records: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          is_manual: boolean
          latitude: number | null
          location_id: string
          longitude: number | null
          manual_observation: string | null
          manual_registered_by: string | null
          method: Database["public"]["Enums"]["clock_method"]
          timestamp: string
          type: Database["public"]["Enums"]["clock_type"]
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          is_manual?: boolean
          latitude?: number | null
          location_id: string
          longitude?: number | null
          manual_observation?: string | null
          manual_registered_by?: string | null
          method: Database["public"]["Enums"]["clock_method"]
          timestamp?: string
          type: Database["public"]["Enums"]["clock_type"]
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          is_manual?: boolean
          latitude?: number | null
          location_id?: string
          longitude?: number | null
          manual_observation?: string | null
          manual_registered_by?: string | null
          method?: Database["public"]["Enums"]["clock_method"]
          timestamp?: string
          type?: Database["public"]["Enums"]["clock_type"]
        }
        Relationships: [
          {
            foreignKeyName: "clock_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_records_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          admin_user_id: string | null
          created_at: string
          email: string | null
          id: string
          is_blocked: boolean
          max_employees: number
          max_locations: number
          name: string
          payment_status: string | null
          phone: string | null
          plan: string
          status: string
          subscription_end_date: string | null
          subscription_start_date: string | null
          updated_at: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_blocked?: boolean
          max_employees?: number
          max_locations?: number
          name: string
          payment_status?: string | null
          phone?: string | null
          plan?: string
          status?: string
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          updated_at?: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_blocked?: boolean
          max_employees?: number
          max_locations?: number
          name?: string
          payment_status?: string | null
          phone?: string | null
          plan?: string
          status?: string
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employee_locations: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          is_primary: boolean
          location_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          is_primary?: boolean
          location_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          is_primary?: boolean
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_locations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          accumulated_overtime_minutes: number | null
          company_id: string | null
          count_early_entry_as_extra: boolean | null
          created_at: string
          id: string
          invitation_accepted: boolean | null
          is_active: boolean
          lunch_duration_minutes: number | null
          overtime_compensation_mode: string | null
          overtime_rate: number | null
          schedule_type: string | null
          time_off_days_taken: number | null
          type: Database["public"]["Enums"]["employee_type"]
          updated_at: string
          user_id: string
          work_end_time: string | null
          work_start_time: string | null
        }
        Insert: {
          accumulated_overtime_minutes?: number | null
          company_id?: string | null
          count_early_entry_as_extra?: boolean | null
          created_at?: string
          id?: string
          invitation_accepted?: boolean | null
          is_active?: boolean
          lunch_duration_minutes?: number | null
          overtime_compensation_mode?: string | null
          overtime_rate?: number | null
          schedule_type?: string | null
          time_off_days_taken?: number | null
          type?: Database["public"]["Enums"]["employee_type"]
          updated_at?: string
          user_id: string
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Update: {
          accumulated_overtime_minutes?: number | null
          company_id?: string | null
          count_early_entry_as_extra?: boolean | null
          created_at?: string
          id?: string
          invitation_accepted?: boolean | null
          is_active?: boolean
          lunch_duration_minutes?: number | null
          overtime_compensation_mode?: string | null
          overtime_rate?: number | null
          schedule_type?: string | null
          time_off_days_taken?: number | null
          type?: Database["public"]["Enums"]["employee_type"]
          updated_at?: string
          user_id?: string
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_entries: {
        Row: {
          amount: number
          category: string
          client_name: string | null
          company_id: string | null
          created_at: string
          description: string
          due_date: string | null
          entry_type: string
          id: string
          is_recurring: boolean
          notes: string | null
          notification_days: number | null
          notification_sent: boolean | null
          paid_date: string | null
          recurrence_day: number | null
          recurrence_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          entry_type?: string
          id?: string
          is_recurring?: boolean
          notes?: string | null
          notification_days?: number | null
          notification_sent?: boolean | null
          paid_date?: string | null
          recurrence_day?: number | null
          recurrence_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          entry_type?: string
          id?: string
          is_recurring?: boolean
          notes?: string | null
          notification_days?: number | null
          notification_sent?: boolean | null
          paid_date?: string | null
          recurrence_day?: number | null
          recurrence_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_schedules: {
        Row: {
          created_at: string
          cycle_start_date: string | null
          day_of_week: number
          employee_id: string
          end_time: string
          id: string
          location_id: string
          lunch_end_time: string | null
          lunch_start_time: string | null
          notes: string | null
          requires_lunch: boolean
          schedule_type: string
          start_time: string
          template_id: string | null
          tolerance_minutes: number
          updated_at: string
          works: boolean
        }
        Insert: {
          created_at?: string
          cycle_start_date?: string | null
          day_of_week: number
          employee_id: string
          end_time?: string
          id?: string
          location_id: string
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          notes?: string | null
          requires_lunch?: boolean
          schedule_type?: string
          start_time?: string
          template_id?: string | null
          tolerance_minutes?: number
          updated_at?: string
          works?: boolean
        }
        Update: {
          created_at?: string
          cycle_start_date?: string | null
          day_of_week?: number
          employee_id?: string
          end_time?: string
          id?: string
          location_id?: string
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          notes?: string | null
          requires_lunch?: boolean
          schedule_type?: string
          start_time?: string
          template_id?: string | null
          tolerance_minutes?: number
          updated_at?: string
          works?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fixed_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "schedule_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      lateness_alerts: {
        Row: {
          alert_sent_at: string
          created_at: string
          employee_id: string
          id: string
          location_id: string
          observation: string | null
          response_at: string | null
          response_notified: boolean | null
          response_type: string | null
          schedule_date: string
          scheduled_time: string
        }
        Insert: {
          alert_sent_at?: string
          created_at?: string
          employee_id: string
          id?: string
          location_id: string
          observation?: string | null
          response_at?: string | null
          response_notified?: boolean | null
          response_type?: string | null
          schedule_date: string
          scheduled_time: string
        }
        Update: {
          alert_sent_at?: string
          created_at?: string
          employee_id?: string
          id?: string
          location_id?: string
          observation?: string | null
          response_at?: string | null
          response_notified?: boolean | null
          response_type?: string | null
          schedule_date?: string
          scheduled_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "lateness_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateness_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          latitude: number
          longitude: number
          name: string
          qr_code: string
          radius: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          name: string
          qr_code?: string
          radius?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          qr_code?: string
          radius?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      master_users: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_location_admin: boolean
          name: string
          receives_alerts: boolean
          receives_entry: boolean
          receives_exit: boolean
          receives_lunch_in: boolean
          receives_lunch_out: boolean
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["notification_scope"]
          updated_at: string
          whatsapp: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_location_admin?: boolean
          name: string
          receives_alerts?: boolean
          receives_entry?: boolean
          receives_exit?: boolean
          receives_lunch_in?: boolean
          receives_lunch_out?: boolean
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["notification_scope"]
          updated_at?: string
          whatsapp: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_location_admin?: boolean
          name?: string
          receives_alerts?: boolean
          receives_entry?: boolean
          receives_exit?: boolean
          receives_lunch_in?: boolean
          receives_lunch_out?: boolean
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["notification_scope"]
          updated_at?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      punctual_schedules: {
        Row: {
          created_at: string
          date: string
          employee_id: string
          end_time: string
          id: string
          location_id: string
          requires_lunch: boolean
          start_time: string
          tolerance_minutes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          employee_id: string
          end_time?: string
          id?: string
          location_id: string
          requires_lunch?: boolean
          start_time?: string
          tolerance_minutes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string
          end_time?: string
          id?: string
          location_id?: string
          requires_lunch?: boolean
          start_time?: string
          tolerance_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "punctual_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punctual_schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_templates: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          schedule_type: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          schedule_type?: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          schedule_type?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shift_swaps: {
        Row: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          company_id: string | null
          created_at: string
          id: string
          location_id: string
          reason: string | null
          requester_date: string
          requester_employee_id: string
          requester_end_time: string
          requester_start_time: string
          schedule_type: string
          status: string
          target_accepted_at: string | null
          target_date: string
          target_employee_id: string
          target_end_time: string
          target_start_time: string
          updated_at: string
        }
        Insert: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          location_id: string
          reason?: string | null
          requester_date: string
          requester_employee_id: string
          requester_end_time?: string
          requester_start_time?: string
          schedule_type?: string
          status?: string
          target_accepted_at?: string | null
          target_date: string
          target_employee_id: string
          target_end_time?: string
          target_start_time?: string
          updated_at?: string
        }
        Update: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          location_id?: string
          reason?: string | null
          requester_date?: string
          requester_employee_id?: string
          requester_end_time?: string
          requester_start_time?: string
          schedule_type?: string
          status?: string
          target_accepted_at?: string | null
          target_date?: string
          target_employee_id?: string
          target_end_time?: string
          target_start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_swaps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_requester_employee_id_fkey"
            columns: ["requester_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_target_employee_id_fkey"
            columns: ["target_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      zapi_config: {
        Row: {
          client_token: string | null
          created_at: string
          id: string
          instance_id: string
          is_active: boolean
          token: string
          updated_at: string
        }
        Insert: {
          client_token?: string | null
          created_at?: string
          id?: string
          instance_id: string
          is_active?: boolean
          token: string
          updated_at?: string
        }
        Update: {
          client_token?: string | null
          created_at?: string
          id?: string
          instance_id?: string
          is_active?: boolean
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
      is_master_user: { Args: { _user_id: string }; Returns: boolean }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      clock_method: "qr" | "gps"
      clock_type: "entry" | "lunch_out" | "lunch_in" | "exit"
      employee_type: "fixed" | "substitute"
      notification_scope: "all" | "location" | "employee"
      user_role: "admin" | "manager" | "employee"
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
      clock_method: ["qr", "gps"],
      clock_type: ["entry", "lunch_out", "lunch_in", "exit"],
      employee_type: ["fixed", "substitute"],
      notification_scope: ["all", "location", "employee"],
      user_role: ["admin", "manager", "employee"],
    },
  },
} as const
