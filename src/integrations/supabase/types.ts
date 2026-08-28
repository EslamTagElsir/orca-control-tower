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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      orca_decision_episodes: {
        Row: {
          id: string
          inference_id: string
          opened_at: string
          opened_sim_ms: number
          provenance: string
          recommendation_id: string
          run_id: string
          shipment_id: string
          simulation_human_decision_required: boolean
          state_snapshot_id: string | null
          trigger_event_id: string | null
        }
        Insert: {
          id?: string
          inference_id: string
          opened_at?: string
          opened_sim_ms: number
          provenance?: string
          recommendation_id: string
          run_id: string
          shipment_id: string
          simulation_human_decision_required?: boolean
          state_snapshot_id?: string | null
          trigger_event_id?: string | null
        }
        Update: {
          id?: string
          inference_id?: string
          opened_at?: string
          opened_sim_ms?: number
          provenance?: string
          recommendation_id?: string
          run_id?: string
          shipment_id?: string
          simulation_human_decision_required?: boolean
          state_snapshot_id?: string | null
          trigger_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orca_decision_episodes_inference_id_fkey"
            columns: ["inference_id"]
            isOneToOne: false
            referencedRelation: "orca_model_inferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orca_decision_episodes_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: true
            referencedRelation: "orca_model_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orca_decision_episodes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orca_simulation_runs"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "orca_decision_episodes_state_snapshot_id_fkey"
            columns: ["state_snapshot_id"]
            isOneToOne: false
            referencedRelation: "orca_state_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      orca_human_decisions: {
        Row: {
          actor_label: string
          chosen_action: string
          decided_at: string
          decision: string
          decision_latency_ms: number
          episode_id: string
          id: string
          note: string | null
          provenance: string
          reason_code: string
          recommended_action: string
        }
        Insert: {
          actor_label?: string
          chosen_action: string
          decided_at?: string
          decision: string
          decision_latency_ms: number
          episode_id: string
          id?: string
          note?: string | null
          provenance?: string
          reason_code: string
          recommended_action: string
        }
        Update: {
          actor_label?: string
          chosen_action?: string
          decided_at?: string
          decision?: string
          decision_latency_ms?: number
          episode_id?: string
          id?: string
          note?: string | null
          provenance?: string
          reason_code?: string
          recommended_action?: string
        }
        Relationships: [
          {
            foreignKeyName: "orca_human_decisions_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: true
            referencedRelation: "orca_decision_episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      orca_learning_dataset_versions: {
        Row: {
          content_hash: string | null
          created_at: string
          dataset_key: string
          id: string
          purpose: string
          row_count: number
          selection_spec: Json
          source_provenance: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          dataset_key: string
          id?: string
          purpose: string
          row_count?: number
          selection_spec: Json
          source_provenance?: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          dataset_key?: string
          id?: string
          purpose?: string
          row_count?: number
          selection_spec?: Json
          source_provenance?: string
        }
        Relationships: []
      }
      orca_learning_training_runs: {
        Row: {
          algorithm: string | null
          artifact_ref: string | null
          completed_at: string | null
          created_at: string
          dataset_version_id: string
          human_approved: boolean
          hyperparameters: Json | null
          id: string
          metrics: Json | null
          status: string
          training_kind: string
        }
        Insert: {
          algorithm?: string | null
          artifact_ref?: string | null
          completed_at?: string | null
          created_at?: string
          dataset_version_id: string
          human_approved?: boolean
          hyperparameters?: Json | null
          id?: string
          metrics?: Json | null
          status: string
          training_kind: string
        }
        Update: {
          algorithm?: string | null
          artifact_ref?: string | null
          completed_at?: string | null
          created_at?: string
          dataset_version_id?: string
          human_approved?: boolean
          hyperparameters?: Json | null
          id?: string
          metrics?: Json | null
          status?: string
          training_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "orca_learning_training_runs_dataset_version_id_fkey"
            columns: ["dataset_version_id"]
            isOneToOne: false
            referencedRelation: "orca_learning_dataset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      orca_model_explanations: {
        Row: {
          causal_candidates: Json
          causal_scope: string
          causal_stability: string | null
          created_at: string
          evidence_label: string
          id: string
          inference_id: string
          probability_late: number
          shap_contributions: Json
          top_predictive_drivers: Json
        }
        Insert: {
          causal_candidates: Json
          causal_scope?: string
          causal_stability?: string | null
          created_at?: string
          evidence_label?: string
          id?: string
          inference_id: string
          probability_late: number
          shap_contributions: Json
          top_predictive_drivers: Json
        }
        Update: {
          causal_candidates?: Json
          causal_scope?: string
          causal_stability?: string | null
          created_at?: string
          evidence_label?: string
          id?: string
          inference_id?: string
          probability_late?: number
          shap_contributions?: Json
          top_predictive_drivers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "orca_model_explanations_inference_id_fkey"
            columns: ["inference_id"]
            isOneToOne: false
            referencedRelation: "orca_model_inferences"
            referencedColumns: ["id"]
          },
        ]
      }
      orca_model_inferences: {
        Row: {
          classification_decision: boolean
          created_at: string
          decision_threshold: number
          evidence_label: string
          feature_schema_version: string
          features: Json
          id: string
          inference_kind: string
          model_version: string
          prediction_contract_version: string
          probability_late: number
          risk_tier: string
          run_id: string
          severity_interval_90: Json
          severity_p50: number
          shipment_id: string
          sim_clock_ms: number
          state_snapshot_id: string | null
          trigger_event_id: string | null
        }
        Insert: {
          classification_decision: boolean
          created_at?: string
          decision_threshold: number
          evidence_label?: string
          feature_schema_version?: string
          features: Json
          id?: string
          inference_kind: string
          model_version: string
          prediction_contract_version: string
          probability_late: number
          risk_tier: string
          run_id: string
          severity_interval_90: Json
          severity_p50: number
          shipment_id: string
          sim_clock_ms: number
          state_snapshot_id?: string | null
          trigger_event_id?: string | null
        }
        Update: {
          classification_decision?: boolean
          created_at?: string
          decision_threshold?: number
          evidence_label?: string
          feature_schema_version?: string
          features?: Json
          id?: string
          inference_kind?: string
          model_version?: string
          prediction_contract_version?: string
          probability_late?: number
          risk_tier?: string
          run_id?: string
          severity_interval_90?: Json
          severity_p50?: number
          shipment_id?: string
          sim_clock_ms?: number
          state_snapshot_id?: string | null
          trigger_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orca_model_inferences_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orca_simulation_runs"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "orca_model_inferences_state_snapshot_id_fkey"
            columns: ["state_snapshot_id"]
            isOneToOne: false
            referencedRelation: "orca_state_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      orca_model_recommendations: {
        Row: {
          backend_human_approval_required: boolean
          created_at: string
          decision_reason: Json
          evidence_label: string
          expected_impact_type: string
          id: string
          inference_id: string
          recommendation: string
          robustness: string
          run_id: string
          shipment_id: string
        }
        Insert: {
          backend_human_approval_required: boolean
          created_at?: string
          decision_reason: Json
          evidence_label?: string
          expected_impact_type: string
          id?: string
          inference_id: string
          recommendation: string
          robustness: string
          run_id: string
          shipment_id: string
        }
        Update: {
          backend_human_approval_required?: boolean
          created_at?: string
          decision_reason?: Json
          evidence_label?: string
          expected_impact_type?: string
          id?: string
          inference_id?: string
          recommendation?: string
          robustness?: string
          run_id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orca_model_recommendations_inference_id_fkey"
            columns: ["inference_id"]
            isOneToOne: false
            referencedRelation: "orca_model_inferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orca_model_recommendations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orca_simulation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      orca_simulation_events: {
        Row: {
          created_at: string
          detail: string
          event_id: string
          event_type: string
          family: string
          feature_audit: Json | null
          id: string
          provenance: string
          risk_after: number | null
          risk_before: number | null
          run_id: string
          shipment_id: string
          sim_clock_ms: number
        }
        Insert: {
          created_at?: string
          detail: string
          event_id: string
          event_type: string
          family: string
          feature_audit?: Json | null
          id?: string
          provenance: string
          risk_after?: number | null
          risk_before?: number | null
          run_id: string
          shipment_id: string
          sim_clock_ms: number
        }
        Update: {
          created_at?: string
          detail?: string
          event_id?: string
          event_type?: string
          family?: string
          feature_audit?: Json | null
          id?: string
          provenance?: string
          risk_after?: number | null
          risk_before?: number | null
          run_id?: string
          shipment_id?: string
          sim_clock_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "orca_simulation_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orca_simulation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      orca_simulation_interventions: {
        Row: {
          action: string
          applied_at: string
          applied_sim_ms: number
          effect_spec: Json
          episode_id: string
          human_decision_id: string
          id: string
          provenance: string
          run_id: string
          shipment_id: string
          simulator_policy_version: string
        }
        Insert: {
          action: string
          applied_at?: string
          applied_sim_ms: number
          effect_spec: Json
          episode_id: string
          human_decision_id: string
          id?: string
          provenance?: string
          run_id: string
          shipment_id: string
          simulator_policy_version?: string
        }
        Update: {
          action?: string
          applied_at?: string
          applied_sim_ms?: number
          effect_spec?: Json
          episode_id?: string
          human_decision_id?: string
          id?: string
          provenance?: string
          run_id?: string
          shipment_id?: string
          simulator_policy_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "orca_simulation_interventions_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "orca_decision_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orca_simulation_interventions_human_decision_id_fkey"
            columns: ["human_decision_id"]
            isOneToOne: false
            referencedRelation: "orca_human_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orca_simulation_interventions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orca_simulation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      orca_simulation_outcomes: {
        Row: {
          delivered_on_time: boolean
          delivered_sim_ms: number
          final_eta_variance_hours: number
          final_features: Json
          id: string
          intervention_count: number
          provenance: string
          recorded_at: string
          run_id: string
          shipment_id: string
          simulated_delay_hours: number
        }
        Insert: {
          delivered_on_time: boolean
          delivered_sim_ms: number
          final_eta_variance_hours: number
          final_features: Json
          id?: string
          intervention_count?: number
          provenance?: string
          recorded_at?: string
          run_id: string
          shipment_id: string
          simulated_delay_hours: number
        }
        Update: {
          delivered_on_time?: boolean
          delivered_sim_ms?: number
          final_eta_variance_hours?: number
          final_features?: Json
          id?: string
          intervention_count?: number
          provenance?: string
          recorded_at?: string
          run_id?: string
          shipment_id?: string
          simulated_delay_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "orca_simulation_outcomes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orca_simulation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      orca_simulation_runs: {
        Row: {
          created_at: string
          ended_at: string | null
          provenance: string
          run_id: string
          seed: number
          simulator_version: string
          speed: number
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          provenance?: string
          run_id: string
          seed: number
          simulator_version?: string
          speed?: number
          started_at?: string
          status: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          provenance?: string
          run_id?: string
          seed?: number
          simulator_version?: string
          speed?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      orca_simulation_shipments: {
        Row: {
          created_at: string
          created_sim_ms: number
          destination: string
          feature_schema_version: string
          id: string
          initial_features: Json
          mode: string
          origin: string
          product_group: string | null
          provenance: string
          route: string
          run_id: string
          shipment_id: string
          simulator_version: string
          template_id: string
          vendor: string | null
        }
        Insert: {
          created_at?: string
          created_sim_ms: number
          destination: string
          feature_schema_version?: string
          id?: string
          initial_features: Json
          mode: string
          origin: string
          product_group?: string | null
          provenance?: string
          route: string
          run_id: string
          shipment_id: string
          simulator_version?: string
          template_id: string
          vendor?: string | null
        }
        Update: {
          created_at?: string
          created_sim_ms?: number
          destination?: string
          feature_schema_version?: string
          id?: string
          initial_features?: Json
          mode?: string
          origin?: string
          product_group?: string | null
          provenance?: string
          route?: string
          run_id?: string
          shipment_id?: string
          simulator_version?: string
          template_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orca_simulation_shipments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orca_simulation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      orca_state_snapshots: {
        Row: {
          created_at: string
          eta_variance_hours: number
          exception_family: string | null
          exception_open: boolean
          feature_schema_version: string
          features: Json
          id: string
          position: Json
          progress: number
          provenance: string
          run_id: string
          shipment_id: string
          shipment_status: string
          sim_clock_ms: number
          simulator_version: string
          trigger_event_id: string | null
        }
        Insert: {
          created_at?: string
          eta_variance_hours: number
          exception_family?: string | null
          exception_open: boolean
          feature_schema_version?: string
          features: Json
          id?: string
          position: Json
          progress: number
          provenance?: string
          run_id: string
          shipment_id: string
          shipment_status: string
          sim_clock_ms: number
          simulator_version?: string
          trigger_event_id?: string | null
        }
        Update: {
          created_at?: string
          eta_variance_hours?: number
          exception_family?: string | null
          exception_open?: boolean
          feature_schema_version?: string
          features?: Json
          id?: string
          position?: Json
          progress?: number
          provenance?: string
          run_id?: string
          shipment_id?: string
          shipment_status?: string
          sim_clock_ms?: number
          simulator_version?: string
          trigger_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orca_state_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orca_simulation_runs"
            referencedColumns: ["run_id"]
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
