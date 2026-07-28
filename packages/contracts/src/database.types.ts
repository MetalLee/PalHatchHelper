// Generated from a local PostgreSQL catalog. Do not edit directly.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      admin_audit_events: {
        Row: {
          id: string;
          actor_user_id: string | null;
          event_type: string;
          target_type: string;
          target_id: string | null;
          idempotency_key: string | null;
          safe_summary: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          event_type: string;
          target_type: string;
          target_id?: string | null;
          idempotency_key?: string | null;
          safe_summary?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_user_id?: string | null;
          event_type?: string;
          target_type?: string;
          target_id?: string | null;
          idempotency_key?: string | null;
          safe_summary?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_catalog_operations: {
        Row: {
          id: string;
          operation_type: string;
          upload_id: string;
          created_by: string;
          idempotency_key: string;
          status: string;
          claimed_by: string | null;
          claimed_at: string | null;
          completed_at: string | null;
          result_summary: Json;
          error_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          operation_type: string;
          upload_id: string;
          created_by: string;
          idempotency_key: string;
          status?: string;
          claimed_by?: string | null;
          claimed_at?: string | null;
          completed_at?: string | null;
          result_summary?: Json;
          error_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          operation_type?: string;
          upload_id?: string;
          created_by?: string;
          idempotency_key?: string;
          status?: string;
          claimed_by?: string | null;
          claimed_at?: string | null;
          completed_at?: string | null;
          result_summary?: Json;
          error_code?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_catalog_operations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_catalog_operations_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "admin_catalog_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_catalog_uploads: {
        Row: {
          id: string;
          created_by: string;
          source_id: string | null;
          original_filename: string;
          object_path: string;
          size_bytes: number;
          package_sha256: string;
          status: string;
          validation_summary: Json;
          staged_version_id: string | null;
          idempotency_key: string;
          created_at: string;
          uploaded_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          created_by: string;
          source_id?: string | null;
          original_filename: string;
          object_path: string;
          size_bytes: number;
          package_sha256: string;
          status?: string;
          validation_summary?: Json;
          staged_version_id?: string | null;
          idempotency_key: string;
          created_at?: string;
          uploaded_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          created_by?: string;
          source_id?: string | null;
          original_filename?: string;
          object_path?: string;
          size_bytes?: number;
          package_sha256?: string;
          status?: string;
          validation_summary?: Json;
          staged_version_id?: string | null;
          idempotency_key?: string;
          created_at?: string;
          uploaded_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_catalog_uploads_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_catalog_uploads_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "game_data_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_catalog_uploads_staged_version_id_fkey";
            columns: ["staged_version_id"];
            isOneToOne: false;
            referencedRelation: "game_data_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_command_results: {
        Row: {
          command_id: string;
          status: Database["public"]["Enums"]["agent_command_status"];
          worker_id: string;
          error_code: string | null;
          safe_summary: Json;
          started_at: string;
          completed_at: string;
        };
        Insert: {
          command_id: string;
          status: Database["public"]["Enums"]["agent_command_status"];
          worker_id: string;
          error_code?: string | null;
          safe_summary?: Json;
          started_at: string;
          completed_at: string;
        };
        Update: {
          command_id?: string;
          status?: Database["public"]["Enums"]["agent_command_status"];
          worker_id?: string;
          error_code?: string | null;
          safe_summary?: Json;
          started_at?: string;
          completed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_command_results_command_id_fkey";
            columns: ["command_id"];
            isOneToOne: false;
            referencedRelation: "agent_commands";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_commands: {
        Row: {
          id: string;
          command_type: string;
          payload: Json;
          idempotency_key: string;
          created_by: string;
          expires_at: string;
          status: Database["public"]["Enums"]["agent_command_status"];
          claimed_by: string | null;
          claimed_at: string | null;
          completed_at: string | null;
          error_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          command_type: string;
          payload?: Json;
          idempotency_key: string;
          created_by: string;
          expires_at: string;
          status?: Database["public"]["Enums"]["agent_command_status"];
          claimed_by?: string | null;
          claimed_at?: string | null;
          completed_at?: string | null;
          error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          command_type?: string;
          payload?: Json;
          idempotency_key?: string;
          created_by?: string;
          expires_at?: string;
          status?: Database["public"]["Enums"]["agent_command_status"];
          claimed_by?: string | null;
          claimed_at?: string | null;
          completed_at?: string | null;
          error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_commands_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_worker_heartbeats: {
        Row: {
          worker_kind: string;
          worker_id: string;
          deployment_version: string;
          safe_metadata: Json;
          heartbeat_at: string;
        };
        Insert: {
          worker_kind: string;
          worker_id: string;
          deployment_version: string;
          safe_metadata?: Json;
          heartbeat_at: string;
        };
        Update: {
          worker_kind?: string;
          worker_id?: string;
          deployment_version?: string;
          safe_metadata?: Json;
          heartbeat_at?: string;
        };
        Relationships: [];
      };
      breeding_data_sources: {
        Row: {
          id: string;
          name: string;
          source_type: Database["public"]["Enums"]["breeding_source_type"];
          source_url: string | null;
          enabled: boolean;
          fetch_schedule: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          source_type: Database["public"]["Enums"]["breeding_source_type"];
          source_url?: string | null;
          enabled?: boolean;
          fetch_schedule?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          source_type?: Database["public"]["Enums"]["breeding_source_type"];
          source_url?: string | null;
          enabled?: boolean;
          fetch_schedule?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      breeding_data_versions: {
        Row: {
          id: string;
          source_id: string | null;
          external_version: string | null;
          content_hash: string;
          status: Database["public"]["Enums"]["breeding_data_status"];
          validation_report: Json;
          imported_at: string;
          published_at: string | null;
          published_by: string | null;
        };
        Insert: {
          id?: string;
          source_id?: string | null;
          external_version?: string | null;
          content_hash: string;
          status?: Database["public"]["Enums"]["breeding_data_status"];
          validation_report?: Json;
          imported_at?: string;
          published_at?: string | null;
          published_by?: string | null;
        };
        Update: {
          id?: string;
          source_id?: string | null;
          external_version?: string | null;
          content_hash?: string;
          status?: Database["public"]["Enums"]["breeding_data_status"];
          validation_report?: Json;
          imported_at?: string;
          published_at?: string | null;
          published_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "breeding_data_versions_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breeding_data_versions_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "breeding_data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      breeding_jobs: {
        Row: {
          id: string;
          requester_user_id: string;
          world_id: string;
          player_id: string;
          guild_id: string | null;
          target_pal_id: string;
          desired_passive_ids: string[];
          optimization_mode: Database["public"]["Enums"]["optimization_mode"];
          inventory_snapshot_id: string;
          breeding_data_version_id: string;
          algorithm_version: string;
          scoring_profile_version: string;
          status: Database["public"]["Enums"]["breeding_job_status"];
          request_fingerprint: string;
          idempotency_key: string;
          locked_by: string | null;
          locked_at: string | null;
          heartbeat_at: string | null;
          attempt_count: number;
          max_attempts: number;
          error_code: string | null;
          error_summary: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          lease_token: string | null;
          game_data_version_id: string;
          game_data_content_hash: string;
          allow_guild_shared: boolean;
          max_generations: number;
          source_plan_id: string | null;
          recalculation_reason: string | null;
          locale: string;
        };
        Insert: {
          id?: string;
          requester_user_id: string;
          world_id: string;
          player_id: string;
          guild_id?: string | null;
          target_pal_id: string;
          desired_passive_ids?: string[];
          optimization_mode: Database["public"]["Enums"]["optimization_mode"];
          inventory_snapshot_id: string;
          breeding_data_version_id: string;
          algorithm_version: string;
          scoring_profile_version: string;
          status?: Database["public"]["Enums"]["breeding_job_status"];
          request_fingerprint: string;
          idempotency_key: string;
          locked_by?: string | null;
          locked_at?: string | null;
          heartbeat_at?: string | null;
          attempt_count?: number;
          max_attempts?: number;
          error_code?: string | null;
          error_summary?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          lease_token?: string | null;
          game_data_version_id: string;
          game_data_content_hash: string;
          allow_guild_shared?: boolean;
          max_generations?: number;
          source_plan_id?: string | null;
          recalculation_reason?: string | null;
          locale?: string;
        };
        Update: {
          id?: string;
          requester_user_id?: string;
          world_id?: string;
          player_id?: string;
          guild_id?: string | null;
          target_pal_id?: string;
          desired_passive_ids?: string[];
          optimization_mode?: Database["public"]["Enums"]["optimization_mode"];
          inventory_snapshot_id?: string;
          breeding_data_version_id?: string;
          algorithm_version?: string;
          scoring_profile_version?: string;
          status?: Database["public"]["Enums"]["breeding_job_status"];
          request_fingerprint?: string;
          idempotency_key?: string;
          locked_by?: string | null;
          locked_at?: string | null;
          heartbeat_at?: string | null;
          attempt_count?: number;
          max_attempts?: number;
          error_code?: string | null;
          error_summary?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          lease_token?: string | null;
          game_data_version_id?: string;
          game_data_content_hash?: string;
          allow_guild_shared?: boolean;
          max_generations?: number;
          source_plan_id?: string | null;
          recalculation_reason?: string | null;
          locale?: string;
        };
        Relationships: [
          {
            foreignKeyName: "breeding_jobs_breeding_data_version_id_fkey";
            columns: ["breeding_data_version_id"];
            isOneToOne: false;
            referencedRelation: "breeding_data_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breeding_jobs_game_data_version_id_fkey";
            columns: ["game_data_version_id"];
            isOneToOne: false;
            referencedRelation: "game_data_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breeding_jobs_guild_world_fkey";
            columns: ["guild_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "guilds";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "breeding_jobs_player_world_fkey";
            columns: ["player_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "breeding_jobs_requester_user_id_fkey";
            columns: ["requester_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breeding_jobs_scoring_profile_version_fkey";
            columns: ["scoring_profile_version"];
            isOneToOne: false;
            referencedRelation: "scoring_profiles";
            referencedColumns: ["version"];
          },
          {
            foreignKeyName: "breeding_jobs_snapshot_world_fkey";
            columns: ["inventory_snapshot_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "inventory_snapshots";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "breeding_jobs_source_plan_id_fkey";
            columns: ["source_plan_id"];
            isOneToOne: false;
            referencedRelation: "execution_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breeding_jobs_world_id_fkey";
            columns: ["world_id"];
            isOneToOne: false;
            referencedRelation: "worlds";
            referencedColumns: ["id"];
          },
        ];
      };
      breeding_plans: {
        Row: {
          id: string;
          job_id: string;
          recommended_route_id: string | null;
          ai_provider: string;
          ai_model: string | null;
          ai_explanation: string | null;
          generated_at: string;
          result_digest: string | null;
          route_count: number;
          explanation_codes: string[];
          diagnostics: Json;
          ai_degraded: boolean;
          missing_passive_ids: string[];
        };
        Insert: {
          id?: string;
          job_id: string;
          recommended_route_id?: string | null;
          ai_provider?: string;
          ai_model?: string | null;
          ai_explanation?: string | null;
          generated_at?: string;
          result_digest?: string | null;
          route_count?: number;
          explanation_codes?: string[];
          diagnostics?: Json;
          ai_degraded?: boolean;
          missing_passive_ids?: string[];
        };
        Update: {
          id?: string;
          job_id?: string;
          recommended_route_id?: string | null;
          ai_provider?: string;
          ai_model?: string | null;
          ai_explanation?: string | null;
          generated_at?: string;
          result_digest?: string | null;
          route_count?: number;
          explanation_codes?: string[];
          diagnostics?: Json;
          ai_degraded?: boolean;
          missing_passive_ids?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "breeding_plans_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "breeding_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breeding_plans_recommended_route_fkey";
            columns: ["recommended_route_id"];
            isOneToOne: false;
            referencedRelation: "breeding_routes";
            referencedColumns: ["id"];
          },
        ];
      };
      breeding_recipes: {
        Row: {
          id: string;
          version_id: string;
          parent_a_pal_id: string;
          parent_b_pal_id: string;
          normalized_parent_a_pal_id: string | null;
          normalized_parent_b_pal_id: string | null;
          child_pal_id: string;
          recipe_type: Database["public"]["Enums"]["breeding_recipe_type"];
          metadata: Json;
          created_at: string;
          parent_a_gender: string;
          parent_b_gender: string;
          normalized_parent_a_gender: string | null;
          normalized_parent_b_gender: string | null;
        };
        Insert: {
          id?: string;
          version_id: string;
          parent_a_pal_id: string;
          parent_b_pal_id: string;
          child_pal_id: string;
          recipe_type: Database["public"]["Enums"]["breeding_recipe_type"];
          metadata?: Json;
          created_at?: string;
          parent_a_gender?: string;
          parent_b_gender?: string;
        };
        Update: {
          id?: string;
          version_id?: string;
          parent_a_pal_id?: string;
          parent_b_pal_id?: string;
          child_pal_id?: string;
          recipe_type?: Database["public"]["Enums"]["breeding_recipe_type"];
          metadata?: Json;
          created_at?: string;
          parent_a_gender?: string;
          parent_b_gender?: string;
        };
        Relationships: [
          {
            foreignKeyName: "breeding_recipes_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "breeding_data_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      breeding_routes: {
        Row: {
          id: string;
          plan_id: string;
          rank: number;
          total_score: number;
          generation_count: number;
          estimated_attempts_min: number | null;
          estimated_attempts_max: number | null;
          borrowed_pal_count: number;
          inventory_coverage: number;
          inheritance_score: number;
          score_breakdown: Json;
          created_at: string;
          route_key: string;
          optimization_mode: Database["public"]["Enums"]["optimization_mode"];
          difficulty: string;
          route_payload: Json;
          ai_explanation: string | null;
          ai_labels: string[];
          feasibility_status: string | null;
          adoptable: boolean | null;
          missing_pal_count: number | null;
        };
        Insert: {
          id?: string;
          plan_id: string;
          rank: number;
          total_score: number;
          generation_count: number;
          estimated_attempts_min?: number | null;
          estimated_attempts_max?: number | null;
          borrowed_pal_count: number;
          inventory_coverage: number;
          inheritance_score: number;
          score_breakdown: Json;
          created_at?: string;
          route_key: string;
          optimization_mode: Database["public"]["Enums"]["optimization_mode"];
          difficulty: string;
          route_payload?: Json;
          ai_explanation?: string | null;
          ai_labels?: string[];
        };
        Update: {
          id?: string;
          plan_id?: string;
          rank?: number;
          total_score?: number;
          generation_count?: number;
          estimated_attempts_min?: number | null;
          estimated_attempts_max?: number | null;
          borrowed_pal_count?: number;
          inventory_coverage?: number;
          inheritance_score?: number;
          score_breakdown?: Json;
          created_at?: string;
          route_key?: string;
          optimization_mode?: Database["public"]["Enums"]["optimization_mode"];
          difficulty?: string;
          route_payload?: Json;
          ai_explanation?: string | null;
          ai_labels?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "breeding_routes_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "breeding_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      breeding_steps: {
        Row: {
          id: string;
          route_id: string;
          step_index: number;
          parent_a_instance_uid: string | null;
          parent_b_instance_uid: string | null;
          expected_child_pal_id: string;
          required_passive_ids: string[];
          selected_child_instance_uid: string | null;
          status: Database["public"]["Enums"]["breeding_step_status"];
          completed_at: string | null;
          created_at: string;
          updated_at: string;
          execution_plan_id: string | null;
          parent_a_source_kind: string | null;
          parent_a_step_index: number | null;
          parent_a_required_gender: string | null;
          parent_b_source_kind: string | null;
          parent_b_step_index: number | null;
          parent_b_required_gender: string | null;
          preferred_gender: string | null;
          baseline_snapshot_id: string | null;
          candidate_detection_started_at: string | null;
          attempt_number: number;
          concurrency_version: number;
          skip_reason: string | null;
          invalidation_reasons: Json;
        };
        Insert: {
          id?: string;
          route_id: string;
          step_index: number;
          parent_a_instance_uid?: string | null;
          parent_b_instance_uid?: string | null;
          expected_child_pal_id: string;
          required_passive_ids?: string[];
          selected_child_instance_uid?: string | null;
          status?: Database["public"]["Enums"]["breeding_step_status"];
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          execution_plan_id?: string | null;
          parent_a_source_kind?: string | null;
          parent_a_step_index?: number | null;
          parent_a_required_gender?: string | null;
          parent_b_source_kind?: string | null;
          parent_b_step_index?: number | null;
          parent_b_required_gender?: string | null;
          preferred_gender?: string | null;
          baseline_snapshot_id?: string | null;
          candidate_detection_started_at?: string | null;
          attempt_number?: number;
          concurrency_version?: number;
          skip_reason?: string | null;
          invalidation_reasons?: Json;
        };
        Update: {
          id?: string;
          route_id?: string;
          step_index?: number;
          parent_a_instance_uid?: string | null;
          parent_b_instance_uid?: string | null;
          expected_child_pal_id?: string;
          required_passive_ids?: string[];
          selected_child_instance_uid?: string | null;
          status?: Database["public"]["Enums"]["breeding_step_status"];
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          execution_plan_id?: string | null;
          parent_a_source_kind?: string | null;
          parent_a_step_index?: number | null;
          parent_a_required_gender?: string | null;
          parent_b_source_kind?: string | null;
          parent_b_step_index?: number | null;
          parent_b_required_gender?: string | null;
          preferred_gender?: string | null;
          baseline_snapshot_id?: string | null;
          candidate_detection_started_at?: string | null;
          attempt_number?: number;
          concurrency_version?: number;
          skip_reason?: string | null;
          invalidation_reasons?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "breeding_steps_baseline_snapshot_id_fkey";
            columns: ["baseline_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "inventory_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breeding_steps_execution_plan_id_fkey";
            columns: ["execution_plan_id"];
            isOneToOne: false;
            referencedRelation: "execution_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breeding_steps_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "breeding_routes";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_active_skills: {
        Row: {
          version_id: string;
          active_skill_id: string;
          name_key: string;
          element_type: string;
          power: number | null;
          cooldown_seconds: number | null;
          metadata: Json;
        };
        Insert: {
          version_id: string;
          active_skill_id: string;
          name_key: string;
          element_type: string;
          power?: number | null;
          cooldown_seconds?: number | null;
          metadata?: Json;
        };
        Update: {
          version_id?: string;
          active_skill_id?: string;
          name_key?: string;
          element_type?: string;
          power?: number | null;
          cooldown_seconds?: number | null;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_active_skills_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "game_data_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_breeding_recipes: {
        Row: {
          version_id: string;
          parent_a_pal_id: string;
          parent_b_pal_id: string;
          child_pal_id: string;
          recipe_type: Database["public"]["Enums"]["breeding_recipe_type"];
          metadata: Json;
          parent_a_gender: string;
          parent_b_gender: string;
        };
        Insert: {
          version_id: string;
          parent_a_pal_id: string;
          parent_b_pal_id: string;
          child_pal_id: string;
          recipe_type: Database["public"]["Enums"]["breeding_recipe_type"];
          metadata?: Json;
          parent_a_gender?: string;
          parent_b_gender?: string;
        };
        Update: {
          version_id?: string;
          parent_a_pal_id?: string;
          parent_b_pal_id?: string;
          child_pal_id?: string;
          recipe_type?: Database["public"]["Enums"]["breeding_recipe_type"];
          metadata?: Json;
          parent_a_gender?: string;
          parent_b_gender?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_breeding_child_fkey";
            columns: ["version_id", "child_pal_id"];
            isOneToOne: false;
            referencedRelation: "catalog_pals";
            referencedColumns: ["version_id", "pal_id"];
          },
          {
            foreignKeyName: "catalog_breeding_parent_a_fkey";
            columns: ["version_id", "parent_a_pal_id"];
            isOneToOne: false;
            referencedRelation: "catalog_pals";
            referencedColumns: ["version_id", "pal_id"];
          },
          {
            foreignKeyName: "catalog_breeding_parent_b_fkey";
            columns: ["version_id", "parent_b_pal_id"];
            isOneToOne: false;
            referencedRelation: "catalog_pals";
            referencedColumns: ["version_id", "pal_id"];
          },
        ];
      };
      catalog_localizations: {
        Row: {
          version_id: string;
          locale: string;
          text_key: string;
          text: string;
        };
        Insert: {
          version_id: string;
          locale: string;
          text_key: string;
          text: string;
        };
        Update: {
          version_id?: string;
          locale?: string;
          text_key?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_localizations_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "game_data_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_pal_active_skills: {
        Row: {
          version_id: string;
          pal_id: string;
          active_skill_id: string;
          learn_level: number;
          is_exclusive: boolean;
          metadata: Json;
        };
        Insert: {
          version_id: string;
          pal_id: string;
          active_skill_id: string;
          learn_level: number;
          is_exclusive: boolean;
          metadata?: Json;
        };
        Update: {
          version_id?: string;
          pal_id?: string;
          active_skill_id?: string;
          learn_level?: number;
          is_exclusive?: boolean;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_pal_active_pal_fkey";
            columns: ["version_id", "pal_id"];
            isOneToOne: false;
            referencedRelation: "catalog_pals";
            referencedColumns: ["version_id", "pal_id"];
          },
          {
            foreignKeyName: "catalog_pal_active_skill_fkey";
            columns: ["version_id", "active_skill_id"];
            isOneToOne: false;
            referencedRelation: "catalog_active_skills";
            referencedColumns: ["version_id", "active_skill_id"];
          },
        ];
      };
      catalog_pals: {
        Row: {
          version_id: string;
          pal_id: string;
          encyclopedia_no: number | null;
          name_key: string;
          element_types: string[];
          rarity: number;
          breeding_power: number;
          metadata: Json;
        };
        Insert: {
          version_id: string;
          pal_id: string;
          encyclopedia_no?: number | null;
          name_key: string;
          element_types: string[];
          rarity: number;
          breeding_power: number;
          metadata?: Json;
        };
        Update: {
          version_id?: string;
          pal_id?: string;
          encyclopedia_no?: number | null;
          name_key?: string;
          element_types?: string[];
          rarity?: number;
          breeding_power?: number;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_pals_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "game_data_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_partner_skills: {
        Row: {
          version_id: string;
          partner_skill_id: string;
          pal_id: string;
          name_key: string;
          description_key: string | null;
          metadata: Json;
        };
        Insert: {
          version_id: string;
          partner_skill_id: string;
          pal_id: string;
          name_key: string;
          description_key?: string | null;
          metadata?: Json;
        };
        Update: {
          version_id?: string;
          partner_skill_id?: string;
          pal_id?: string;
          name_key?: string;
          description_key?: string | null;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_partner_pal_fkey";
            columns: ["version_id", "pal_id"];
            isOneToOne: false;
            referencedRelation: "catalog_pals";
            referencedColumns: ["version_id", "pal_id"];
          },
        ];
      };
      catalog_passive_skills: {
        Row: {
          version_id: string;
          passive_skill_id: string;
          name_key: string;
          description_key: string | null;
          rank: number;
          is_negative: boolean;
          metadata: Json;
        };
        Insert: {
          version_id: string;
          passive_skill_id: string;
          name_key: string;
          description_key?: string | null;
          rank: number;
          is_negative: boolean;
          metadata?: Json;
        };
        Update: {
          version_id?: string;
          passive_skill_id?: string;
          name_key?: string;
          description_key?: string | null;
          rank?: number;
          is_negative?: boolean;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_passive_skills_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "game_data_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      deployment_records: {
        Row: {
          id: string;
          git_sha: string;
          agent_image: string | null;
          vercel_deployment_id: string | null;
          status: string;
          safe_summary: Json;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          git_sha: string;
          agent_image?: string | null;
          vercel_deployment_id?: string | null;
          status: string;
          safe_summary?: Json;
          recorded_at?: string;
        };
        Update: {
          id?: string;
          git_sha?: string;
          agent_image?: string | null;
          vercel_deployment_id?: string | null;
          status?: string;
          safe_summary?: Json;
          recorded_at?: string;
        };
        Relationships: [];
      };
      execution_candidate_detection_runs: {
        Row: {
          step_id: string;
          detected_snapshot_id: string;
          candidate_count: number;
          processed_at: string;
        };
        Insert: {
          step_id: string;
          detected_snapshot_id: string;
          candidate_count?: number;
          processed_at?: string;
        };
        Update: {
          step_id?: string;
          detected_snapshot_id?: string;
          candidate_count?: number;
          processed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "execution_candidate_detection_runs_detected_snapshot_id_fkey";
            columns: ["detected_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "inventory_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "execution_candidate_detection_runs_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "breeding_steps";
            referencedColumns: ["id"];
          },
        ];
      };
      execution_plan_dependencies: {
        Row: {
          plan_id: string;
          pal_instance_uid: string;
          owner_player_id_at_adoption: string | null;
          guild_id_at_adoption: string | null;
          gender_at_adoption: Database["public"]["Enums"]["pal_gender"];
          created_at: string;
        };
        Insert: {
          plan_id: string;
          pal_instance_uid: string;
          owner_player_id_at_adoption?: string | null;
          guild_id_at_adoption?: string | null;
          gender_at_adoption: Database["public"]["Enums"]["pal_gender"];
          created_at?: string;
        };
        Update: {
          plan_id?: string;
          pal_instance_uid?: string;
          owner_player_id_at_adoption?: string | null;
          guild_id_at_adoption?: string | null;
          gender_at_adoption?: Database["public"]["Enums"]["pal_gender"];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "execution_plan_dependencies_guild_id_at_adoption_fkey";
            columns: ["guild_id_at_adoption"];
            isOneToOne: false;
            referencedRelation: "guilds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "execution_plan_dependencies_owner_player_id_at_adoption_fkey";
            columns: ["owner_player_id_at_adoption"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "execution_plan_dependencies_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "execution_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      execution_plan_events: {
        Row: {
          id: string;
          plan_id: string;
          step_id: string | null;
          event_type: string;
          actor_user_id: string | null;
          actor_kind: string;
          from_status: string | null;
          to_status: string | null;
          safe_metadata: Json;
          idempotency_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          step_id?: string | null;
          event_type: string;
          actor_user_id?: string | null;
          actor_kind: string;
          from_status?: string | null;
          to_status?: string | null;
          safe_metadata?: Json;
          idempotency_key: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          step_id?: string | null;
          event_type?: string;
          actor_user_id?: string | null;
          actor_kind?: string;
          from_status?: string | null;
          to_status?: string | null;
          safe_metadata?: Json;
          idempotency_key?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "execution_plan_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "execution_plan_events_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "execution_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "execution_plan_events_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "breeding_steps";
            referencedColumns: ["id"];
          },
        ];
      };
      execution_plans: {
        Row: {
          id: string;
          adopted_route_id: string;
          source_job_id: string;
          requester_user_id: string;
          player_id: string;
          world_id: string;
          guild_id: string | null;
          target_pal_id: string;
          desired_passive_ids: string[];
          optimization_mode: Database["public"]["Enums"]["optimization_mode"];
          allow_guild_shared: boolean;
          max_generations: number;
          inventory_snapshot_id: string;
          game_data_version_id: string;
          content_hash: string;
          algorithm_version: string;
          scoring_profile_version: string;
          status: Database["public"]["Enums"]["execution_plan_status"];
          current_step_index: number;
          concurrency_version: number;
          invalidation_reasons: Json;
          adopted_idempotency_key: string;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          paused_at: string | null;
        };
        Insert: {
          id?: string;
          adopted_route_id: string;
          source_job_id: string;
          requester_user_id: string;
          player_id: string;
          world_id: string;
          guild_id?: string | null;
          target_pal_id: string;
          desired_passive_ids?: string[];
          optimization_mode: Database["public"]["Enums"]["optimization_mode"];
          allow_guild_shared: boolean;
          max_generations: number;
          inventory_snapshot_id: string;
          game_data_version_id: string;
          content_hash: string;
          algorithm_version: string;
          scoring_profile_version: string;
          status?: Database["public"]["Enums"]["execution_plan_status"];
          current_step_index?: number;
          concurrency_version?: number;
          invalidation_reasons?: Json;
          adopted_idempotency_key: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          paused_at?: string | null;
        };
        Update: {
          id?: string;
          adopted_route_id?: string;
          source_job_id?: string;
          requester_user_id?: string;
          player_id?: string;
          world_id?: string;
          guild_id?: string | null;
          target_pal_id?: string;
          desired_passive_ids?: string[];
          optimization_mode?: Database["public"]["Enums"]["optimization_mode"];
          allow_guild_shared?: boolean;
          max_generations?: number;
          inventory_snapshot_id?: string;
          game_data_version_id?: string;
          content_hash?: string;
          algorithm_version?: string;
          scoring_profile_version?: string;
          status?: Database["public"]["Enums"]["execution_plan_status"];
          current_step_index?: number;
          concurrency_version?: number;
          invalidation_reasons?: Json;
          adopted_idempotency_key?: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          paused_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "execution_plans_adopted_route_id_fkey";
            columns: ["adopted_route_id"];
            isOneToOne: false;
            referencedRelation: "breeding_routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "execution_plans_game_data_version_id_fkey";
            columns: ["game_data_version_id"];
            isOneToOne: false;
            referencedRelation: "game_data_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "execution_plans_guild_world_fkey";
            columns: ["guild_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "guilds";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "execution_plans_player_world_fkey";
            columns: ["player_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "execution_plans_requester_user_id_fkey";
            columns: ["requester_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "execution_plans_scoring_profile_version_fkey";
            columns: ["scoring_profile_version"];
            isOneToOne: false;
            referencedRelation: "scoring_profiles";
            referencedColumns: ["version"];
          },
          {
            foreignKeyName: "execution_plans_snapshot_world_fkey";
            columns: ["inventory_snapshot_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "inventory_snapshots";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "execution_plans_source_job_id_fkey";
            columns: ["source_job_id"];
            isOneToOne: false;
            referencedRelation: "breeding_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      game_data_import_batches: {
        Row: {
          id: string;
          import_run_id: string;
          entity_type: Database["public"]["Enums"]["game_data_entity_type"];
          idempotency_key: string;
          records: Json;
          record_count: number | null;
          batch_digest: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          import_run_id: string;
          entity_type: Database["public"]["Enums"]["game_data_entity_type"];
          idempotency_key: string;
          records: Json;
          batch_digest: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          import_run_id?: string;
          entity_type?: Database["public"]["Enums"]["game_data_entity_type"];
          idempotency_key?: string;
          records?: Json;
          batch_digest?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_data_import_batches_import_run_id_fkey";
            columns: ["import_run_id"];
            isOneToOne: false;
            referencedRelation: "game_data_import_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      game_data_import_runs: {
        Row: {
          id: string;
          version_id: string;
          status: Database["public"]["Enums"]["game_data_import_status"];
          manifest: Json;
          started_at: string;
          finalized_at: string | null;
        };
        Insert: {
          id?: string;
          version_id: string;
          status?: Database["public"]["Enums"]["game_data_import_status"];
          manifest: Json;
          started_at?: string;
          finalized_at?: string | null;
        };
        Update: {
          id?: string;
          version_id?: string;
          status?: Database["public"]["Enums"]["game_data_import_status"];
          manifest?: Json;
          started_at?: string;
          finalized_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "game_data_import_runs_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "game_data_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      game_data_sources: {
        Row: {
          id: string;
          name: string;
          source_type: Database["public"]["Enums"]["game_data_source_type"];
          source_path: string | null;
          source_url: string | null;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          source_type: Database["public"]["Enums"]["game_data_source_type"];
          source_path?: string | null;
          source_url?: string | null;
          enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          source_type?: Database["public"]["Enums"]["game_data_source_type"];
          source_path?: string | null;
          source_url?: string | null;
          enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      game_data_versions: {
        Row: {
          id: string;
          source_id: string | null;
          game_build_id: string | null;
          game_version: string | null;
          package_hash: string;
          content_hash: string;
          schema_version: string;
          extractor_name: string;
          extractor_version: string;
          artifact_bucket: string | null;
          artifact_path: string | null;
          status: Database["public"]["Enums"]["game_data_status"];
          manifest: Json;
          validation_report: Json;
          imported_at: string;
          validated_at: string | null;
          published_at: string | null;
          published_by: string | null;
        };
        Insert: {
          id?: string;
          source_id?: string | null;
          game_build_id?: string | null;
          game_version?: string | null;
          package_hash: string;
          content_hash: string;
          schema_version: string;
          extractor_name: string;
          extractor_version: string;
          artifact_bucket?: string | null;
          artifact_path?: string | null;
          status?: Database["public"]["Enums"]["game_data_status"];
          manifest?: Json;
          validation_report?: Json;
          imported_at?: string;
          validated_at?: string | null;
          published_at?: string | null;
          published_by?: string | null;
        };
        Update: {
          id?: string;
          source_id?: string | null;
          game_build_id?: string | null;
          game_version?: string | null;
          package_hash?: string;
          content_hash?: string;
          schema_version?: string;
          extractor_name?: string;
          extractor_version?: string;
          artifact_bucket?: string | null;
          artifact_path?: string | null;
          status?: Database["public"]["Enums"]["game_data_status"];
          manifest?: Json;
          validation_report?: Json;
          imported_at?: string;
          validated_at?: string | null;
          published_at?: string | null;
          published_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "game_data_versions_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_data_versions_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "game_data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      guilds: {
        Row: {
          id: string;
          world_id: string;
          game_guild_uid: string;
          name: string;
          last_seen_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          world_id: string;
          game_guild_uid: string;
          name: string;
          last_seen_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          world_id?: string;
          game_guild_uid?: string;
          name?: string;
          last_seen_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guilds_world_id_fkey";
            columns: ["world_id"];
            isOneToOne: false;
            referencedRelation: "worlds";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_snapshots: {
        Row: {
          id: string;
          world_id: string;
          source_save_hash: string;
          source_modified_at: string;
          save_version: string | null;
          parser_name: string;
          parser_version: string;
          status: Database["public"]["Enums"]["inventory_snapshot_status"];
          captured_at: string;
          parsed_at: string | null;
          error_code: string | null;
          error_summary: string | null;
          created_at: string;
          payload_purged_at: string | null;
        };
        Insert: {
          id?: string;
          world_id: string;
          source_save_hash: string;
          source_modified_at: string;
          save_version?: string | null;
          parser_name: string;
          parser_version: string;
          status: Database["public"]["Enums"]["inventory_snapshot_status"];
          captured_at: string;
          parsed_at?: string | null;
          error_code?: string | null;
          error_summary?: string | null;
          created_at?: string;
          payload_purged_at?: string | null;
        };
        Update: {
          id?: string;
          world_id?: string;
          source_save_hash?: string;
          source_modified_at?: string;
          save_version?: string | null;
          parser_name?: string;
          parser_version?: string;
          status?: Database["public"]["Enums"]["inventory_snapshot_status"];
          captured_at?: string;
          parsed_at?: string | null;
          error_code?: string | null;
          error_summary?: string | null;
          created_at?: string;
          payload_purged_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_snapshots_world_id_fkey";
            columns: ["world_id"];
            isOneToOne: false;
            referencedRelation: "worlds";
            referencedColumns: ["id"];
          },
        ];
      };
      pal_instance_lifecycle: {
        Row: {
          world_id: string;
          pal_instance_uid: string;
          first_seen_at: string;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          world_id: string;
          pal_instance_uid: string;
          first_seen_at: string;
          last_seen_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          world_id?: string;
          pal_instance_uid?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pal_instance_lifecycle_world_id_fkey";
            columns: ["world_id"];
            isOneToOne: false;
            referencedRelation: "worlds";
            referencedColumns: ["id"];
          },
        ];
      };
      pal_share_preferences: {
        Row: {
          world_id: string;
          pal_instance_uid: string;
          owner_player_id_at_set: string | null;
          share_enabled: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          world_id: string;
          pal_instance_uid: string;
          owner_player_id_at_set?: string | null;
          share_enabled?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          world_id?: string;
          pal_instance_uid?: string;
          owner_player_id_at_set?: string | null;
          share_enabled?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pal_share_preferences_owner_world_fkey";
            columns: ["owner_player_id_at_set", "world_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "pal_share_preferences_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pal_share_preferences_world_id_fkey";
            columns: ["world_id"];
            isOneToOne: false;
            referencedRelation: "worlds";
            referencedColumns: ["id"];
          },
        ];
      };
      pal_snapshot_items: {
        Row: {
          id: string;
          snapshot_id: string;
          world_id: string;
          pal_instance_uid: string;
          pal_id: string;
          owner_player_id: string | null;
          guild_id: string | null;
          gender: Database["public"]["Enums"]["pal_gender"];
          level: number | null;
          passive_skill_ids: string[];
          location_type: Database["public"]["Enums"]["pal_location_type"];
          location_name: string | null;
          raw_metadata: Json;
          created_at: string;
          ownership_scope: string | null;
          is_boss: boolean | null;
          location_id: string | null;
          location_slot_index: number | null;
          location_access_scope: string;
        };
        Insert: {
          id?: string;
          snapshot_id: string;
          world_id: string;
          pal_instance_uid: string;
          pal_id: string;
          owner_player_id?: string | null;
          guild_id?: string | null;
          gender: Database["public"]["Enums"]["pal_gender"];
          level?: number | null;
          passive_skill_ids?: string[];
          location_type: Database["public"]["Enums"]["pal_location_type"];
          location_name?: string | null;
          raw_metadata?: Json;
          created_at?: string;
          is_boss?: boolean | null;
          location_id?: string | null;
          location_slot_index?: number | null;
          location_access_scope?: string;
        };
        Update: {
          id?: string;
          snapshot_id?: string;
          world_id?: string;
          pal_instance_uid?: string;
          pal_id?: string;
          owner_player_id?: string | null;
          guild_id?: string | null;
          gender?: Database["public"]["Enums"]["pal_gender"];
          level?: number | null;
          passive_skill_ids?: string[];
          location_type?: Database["public"]["Enums"]["pal_location_type"];
          location_name?: string | null;
          raw_metadata?: Json;
          created_at?: string;
          is_boss?: boolean | null;
          location_id?: string | null;
          location_slot_index?: number | null;
          location_access_scope?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pal_snapshot_items_guild_world_fkey";
            columns: ["guild_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "guilds";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "pal_snapshot_items_owner_world_fkey";
            columns: ["owner_player_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "pal_snapshot_items_snapshot_world_fkey";
            columns: ["snapshot_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "inventory_snapshots";
            referencedColumns: ["id", "world_id"];
          },
        ];
      };
      player_binding_events: {
        Row: {
          id: string;
          event_type: string;
          user_id: string;
          player_id: string | null;
          actor_user_id: string;
          binding_version: number | null;
          idempotency_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          user_id: string;
          player_id?: string | null;
          actor_user_id: string;
          binding_version?: number | null;
          idempotency_key: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          user_id?: string;
          player_id?: string | null;
          actor_user_id?: string;
          binding_version?: number | null;
          idempotency_key?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "player_binding_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_binding_events_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_binding_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      player_bindings: {
        Row: {
          user_id: string;
          player_id: string;
          bound_by: string;
          bound_at: string;
          claim_code_hash: string | null;
          concurrency_version: number;
        };
        Insert: {
          user_id: string;
          player_id: string;
          bound_by: string;
          bound_at?: string;
          claim_code_hash?: string | null;
          concurrency_version?: number;
        };
        Update: {
          user_id?: string;
          player_id?: string;
          bound_by?: string;
          bound_at?: string;
          claim_code_hash?: string | null;
          concurrency_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "player_bindings_bound_by_fkey";
            columns: ["bound_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_bindings_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_bindings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      players: {
        Row: {
          id: string;
          world_id: string;
          guild_id: string | null;
          game_player_uid: string;
          nickname: string;
          level: number | null;
          last_seen_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          world_id: string;
          guild_id?: string | null;
          game_player_uid: string;
          nickname: string;
          level?: number | null;
          last_seen_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          world_id?: string;
          guild_id?: string | null;
          game_player_uid?: string;
          nickname?: string;
          level?: number | null;
          last_seen_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "players_guild_world_fkey";
            columns: ["guild_id", "world_id"];
            isOneToOne: false;
            referencedRelation: "guilds";
            referencedColumns: ["id", "world_id"];
          },
          {
            foreignKeyName: "players_world_id_fkey";
            columns: ["world_id"];
            isOneToOne: false;
            referencedRelation: "worlds";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          role: Database["public"]["Enums"]["profile_role"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          role?: Database["public"]["Enums"]["profile_role"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          role?: Database["public"]["Enums"]["profile_role"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      runtime_settings_versions: {
        Row: {
          id: string;
          version: number;
          settings: Json;
          created_by: string | null;
          rolled_back_from_version: number | null;
          idempotency_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          version: number;
          settings: Json;
          created_by?: string | null;
          rolled_back_from_version?: number | null;
          idempotency_key?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          version?: number;
          settings?: Json;
          created_by?: string | null;
          rolled_back_from_version?: number | null;
          idempotency_key?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "runtime_settings_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_breeding_plans: {
        Row: {
          requester_user_id: string;
          route_id: string;
          saved_at: string;
        };
        Insert: {
          requester_user_id: string;
          route_id: string;
          saved_at?: string;
        };
        Update: {
          requester_user_id?: string;
          route_id?: string;
          saved_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_breeding_plans_requester_user_id_fkey";
            columns: ["requester_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_breeding_plans_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "breeding_routes";
            referencedColumns: ["id"];
          },
        ];
      };
      scoring_profiles: {
        Row: {
          id: string;
          version: string;
          optimization_mode: Database["public"]["Enums"]["optimization_mode"];
          algorithm_version: string;
          weights: Json;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          version: string;
          optimization_mode: Database["public"]["Enums"]["optimization_mode"];
          algorithm_version: string;
          weights: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          version?: string;
          optimization_mode?: Database["public"]["Enums"]["optimization_mode"];
          algorithm_version?: string;
          weights?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      step_offspring_candidates: {
        Row: {
          step_id: string;
          pal_instance_uid: string;
          detected_snapshot_id: string;
          match_score: number;
          matched_passive_ids: string[];
          first_detected_at: string;
          confirmed: boolean;
          confirmed_at: string | null;
          confirmed_by: string | null;
          candidate_key: string | null;
          pal_id: string | null;
          species_match: boolean;
          required_passive_count: number;
          gender: string | null;
          level: number | null;
          owner_display_name: string | null;
          location_type: string | null;
          location_name: string | null;
          accessible: boolean;
          match_breakdown: Json;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
        };
        Insert: {
          step_id: string;
          pal_instance_uid: string;
          detected_snapshot_id: string;
          match_score: number;
          matched_passive_ids?: string[];
          first_detected_at: string;
          confirmed?: boolean;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          candidate_key?: string | null;
          pal_id?: string | null;
          species_match?: boolean;
          required_passive_count?: number;
          gender?: string | null;
          level?: number | null;
          owner_display_name?: string | null;
          location_type?: string | null;
          location_name?: string | null;
          accessible?: boolean;
          match_breakdown?: Json;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
        };
        Update: {
          step_id?: string;
          pal_instance_uid?: string;
          detected_snapshot_id?: string;
          match_score?: number;
          matched_passive_ids?: string[];
          first_detected_at?: string;
          confirmed?: boolean;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          candidate_key?: string | null;
          pal_id?: string | null;
          species_match?: boolean;
          required_passive_count?: number;
          gender?: string | null;
          level?: number | null;
          owner_display_name?: string | null;
          location_type?: string | null;
          location_name?: string | null;
          accessible?: boolean;
          match_breakdown?: Json;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "step_candidates_snapshot_fkey";
            columns: ["detected_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "inventory_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "step_offspring_candidates_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "step_offspring_candidates_rejected_by_fkey";
            columns: ["rejected_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "step_offspring_candidates_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "breeding_steps";
            referencedColumns: ["id"];
          },
        ];
      };
      worlds: {
        Row: {
          id: string;
          world_uid: string;
          name: string;
          latest_snapshot_id: string | null;
          active_breeding_version_id: string | null;
          created_at: string;
          updated_at: string;
          active_game_data_version_id: string | null;
          inventory_source_modified_at: string | null;
        };
        Insert: {
          id?: string;
          world_uid: string;
          name: string;
          latest_snapshot_id?: string | null;
          active_breeding_version_id?: string | null;
          created_at?: string;
          updated_at?: string;
          active_game_data_version_id?: string | null;
          inventory_source_modified_at?: string | null;
        };
        Update: {
          id?: string;
          world_uid?: string;
          name?: string;
          latest_snapshot_id?: string | null;
          active_breeding_version_id?: string | null;
          created_at?: string;
          updated_at?: string;
          active_game_data_version_id?: string | null;
          inventory_source_modified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "worlds_active_breeding_version_fkey";
            columns: ["active_breeding_version_id"];
            isOneToOne: false;
            referencedRelation: "breeding_data_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worlds_active_game_data_version_id_fkey";
            columns: ["active_game_data_version_id"];
            isOneToOne: false;
            referencedRelation: "game_data_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worlds_latest_snapshot_fkey";
            columns: ["latest_snapshot_id", "id"];
            isOneToOne: false;
            referencedRelation: "inventory_snapshots";
            referencedColumns: ["id", "world_id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      admin_bind_player: {
        Args: {
          p_user_id: string;
          p_player_id: string;
        };
        Returns: string;
      };
      admin_catalog_version_action: {
        Args: {
          p_action: string;
          p_world_id?: string | null;
          p_version_id?: string | null;
          p_confirmation?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      admin_publish_breeding_version: {
        Args: {
          p_world_id: string;
          p_version_id: string;
        };
        Returns: string;
      };
      admin_unbind_player: {
        Args: {
          p_user_id: string;
        };
        Returns: boolean;
      };
      cancel_breeding_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_lease_token: string;
          p_error_code?: string;
        };
        Returns: boolean;
      };
      claim_breeding_job: {
        Args: {
          p_worker_id: string;
        };
        Returns: Database["public"]["Tables"]["breeding_jobs"]["Row"][];
      };
      complete_breeding_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_lease_token: string;
        };
        Returns: boolean;
      };
      configure_game_data_source: {
        Args: {
          p_source_id: string;
          p_name: string;
          p_source_type: Database["public"]["Enums"]["game_data_source_type"];
          p_source_url?: string | null;
          p_enabled?: boolean;
        };
        Returns: string;
      };
      create_admin_catalog_operation: {
        Args: {
          p_operation_type: string;
          p_upload_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      create_admin_catalog_upload: {
        Args: {
          p_filename: string;
          p_size_bytes: number;
          p_package_sha256: string;
          p_source_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      create_agent_command: {
        Args: {
          p_command_type: string;
          p_payload: Json;
          p_idempotency_key: string;
          p_ttl_seconds?: number;
        };
        Returns: Json;
      };
      create_breeding_job: {
        Args: {
          p_target_pal_id: string;
          p_desired_passive_ids?: string[];
          p_optimization_mode?: Database["public"]["Enums"]["optimization_mode"];
          p_idempotency_key?: string | null;
        };
        Returns: { job_id: string; reused: boolean }[];
      };
      create_breeding_job_v2: {
        Args: {
          p_target_pal_id: string;
          p_desired_passive_ids?: string[];
          p_optimization_mode?: Database["public"]["Enums"]["optimization_mode"];
          p_allow_guild_shared?: boolean;
          p_max_generations?: number;
        };
        Returns: { job_id: string; reused: boolean }[];
      };
      create_breeding_job_v3: {
        Args: {
          p_target_pal_id: string;
          p_desired_passive_ids?: string[];
          p_optimization_mode?: Database["public"]["Enums"]["optimization_mode"];
          p_allow_guild_shared?: boolean;
          p_max_generations?: number;
          p_locale?: string;
        };
        Returns: { job_id: string; reused: boolean }[];
      };
      create_player_binding: {
        Args: {
          p_user_id: string;
          p_player_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      current_guild_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      current_player_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      delete_player_binding: {
        Args: {
          p_user_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      fail_breeding_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_lease_token: string;
          p_error_code: string;
          p_retryable: boolean;
          p_error_summary?: string | null;
        };
        Returns: Database["public"]["Enums"]["breeding_job_status"];
      };
      get_active_scoring_profiles_for_agent: {
        Args: Record<string, never>;
        Returns: {
          version: string;
          optimization_mode: Database["public"]["Enums"]["optimization_mode"];
          algorithm_version: string;
          weights: Json;
        }[];
      };
      get_admin_overview: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_admin_save_parser_status: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_admin_secret_statuses: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_breeder_form_context: {
        Args: {
          p_locale?: string;
        };
        Returns: Json;
      };
      get_breeder_form_context_v2: {
        Args: {
          p_locale?: string;
        };
        Returns: Json;
      };
      get_breeding_data_diff: {
        Args: {
          p_from_version_id: string;
          p_to_version_id: string;
        };
        Returns: Json;
      };
      get_breeding_inventory_for_agent: {
        Args: {
          p_job_id: string;
        };
        Returns: Json;
      };
      get_breeding_job_detail: {
        Args: {
          p_job_id: string;
        };
        Returns: Json;
      };
      get_breeding_job_detail_v2: {
        Args: {
          p_job_id: string;
          p_locale?: string;
        };
        Returns: Json;
      };
      get_game_data_source_for_agent: {
        Args: {
          p_source_id: string;
        };
        Returns: {
          id: string;
          name: string;
          source_type: Database["public"]["Enums"]["game_data_source_type"];
          source_path: string;
          source_url: string;
          enabled: boolean;
        }[];
      };
      get_inventory_catalog_ids_for_agent: {
        Args: {
          p_world_id: string;
        };
        Returns: Json;
      };
      get_inventory_data_status: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_latest_inventory_snapshot_for_agent: {
        Args: {
          p_world_id: string;
        };
        Returns: Json;
      };
      get_runtime_settings: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_saved_breeding_plan_detail: {
        Args: {
          p_route_id: string;
        };
        Returns: Json;
      };
      heartbeat_breeding_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_lease_token: string;
        };
        Returns: boolean;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      list_admin_audit_events: {
        Args: {
          p_limit?: number;
        };
        Returns: Json;
      };
      list_admin_binding_candidates: {
        Args: {
          p_search?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_admin_catalog_sources: {
        Args: Record<string, never>;
        Returns: Json;
      };
      list_admin_catalog_uploads: {
        Args: {
          p_limit?: number;
        };
        Returns: Json;
      };
      list_admin_catalog_versions: {
        Args: {
          p_limit?: number;
        };
        Returns: Json;
      };
      list_admin_catalog_worlds: {
        Args: Record<string, never>;
        Returns: Json;
      };
      list_admin_game_players: {
        Args: {
          p_search?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_admin_jobs: {
        Args: {
          p_limit?: number;
        };
        Returns: Json;
      };
      list_available_pals: {
        Args: {
          p_scope?: string;
        };
        Returns: {
          snapshot_id: string;
          pal_instance_uid: string;
          pal_id: string;
          owner_player_id: string;
          owner_display_name: string;
          guild_id: string;
          gender: Database["public"]["Enums"]["pal_gender"];
          level: number;
          passive_skill_ids: string[];
          location_type: Database["public"]["Enums"]["pal_location_type"];
          location_name: string;
          share_enabled: boolean;
          is_owned_by_requester: boolean;
        }[];
      };
      list_available_pals_page: {
        Args: {
          p_scope?: string;
          p_query?: string | null;
          p_owner_filter_key?: string | null;
          p_gender?: Database["public"]["Enums"]["pal_gender"] | null;
          p_passive_skill_id?: string | null;
          p_location_type?:
            | Database["public"]["Enums"]["pal_location_type"]
            | null;
          p_share_enabled?: boolean | null;
          p_snapshot_id?: string | null;
          p_game_data_version_id?: string | null;
          p_after_pal_id?: string | null;
          p_after_instance_uid?: string | null;
          p_page_size?: number;
        };
        Returns: Json;
      };
      list_available_pals_page_v2: {
        Args: {
          p_scope?: string;
          p_query?: string | null;
          p_owner_filter_key?: string | null;
          p_gender?: Database["public"]["Enums"]["pal_gender"] | null;
          p_passive_skill_id?: string | null;
          p_location_type?:
            | Database["public"]["Enums"]["pal_location_type"]
            | null;
          p_share_enabled?: boolean | null;
          p_snapshot_id?: string | null;
          p_game_data_version_id?: string | null;
          p_page_number?: number;
          p_page_size?: number;
        };
        Returns: Json;
      };
      list_available_pals_page_v3: {
        Args: {
          p_scope?: string;
          p_query?: string | null;
          p_owner_filter_key?: string | null;
          p_gender?: Database["public"]["Enums"]["pal_gender"] | null;
          p_passive_skill_ids?: string[];
          p_location_type?:
            | Database["public"]["Enums"]["pal_location_type"]
            | null;
          p_share_enabled?: boolean | null;
          p_snapshot_id?: string | null;
          p_game_data_version_id?: string | null;
          p_page_number?: number;
          p_page_size?: number;
        };
        Returns: Json;
      };
      list_available_pals_page_v4: {
        Args: {
          p_scope?: string;
          p_query?: string | null;
          p_owner_filter_key?: string | null;
          p_gender?: Database["public"]["Enums"]["pal_gender"] | null;
          p_passive_skill_ids?: string[];
          p_location_type?:
            | Database["public"]["Enums"]["pal_location_type"]
            | null;
          p_share_enabled?: boolean | null;
          p_snapshot_id?: string | null;
          p_game_data_version_id?: string | null;
          p_page_number?: number;
          p_page_size?: number;
          p_locale?: string;
        };
        Returns: Json;
      };
      list_player_binding_events: {
        Args: {
          p_user_id?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_saved_breeding_plans: {
        Args: {
          p_limit?: number;
          p_cursor_saved_at?: string | null;
          p_cursor_route_id?: string | null;
          p_query_boundary?: string | null;
        };
        Returns: Json;
      };
      list_saved_breeding_plans_v2: {
        Args: {
          p_limit?: number;
          p_cursor_saved_at?: string | null;
          p_cursor_route_id?: string | null;
          p_query_boundary?: string | null;
          p_locale?: string;
        };
        Returns: Json;
      };
      mark_admin_catalog_upload_ready: {
        Args: {
          p_upload_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      persist_breeding_ai_result: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_lease_token: string;
          p_provider: string;
          p_model: string;
          p_explanation: string;
          p_degraded: boolean;
          p_route_explanations?: Json;
        };
        Returns: boolean;
      };
      persist_breeding_algorithm_result: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_lease_token: string;
          p_result: Json;
        };
        Returns: string;
      };
      publish_inventory_snapshot: {
        Args: {
          p_world_id: string;
          p_snapshot: Json;
        };
        Returns: string;
      };
      record_inventory_snapshot_failure: {
        Args: {
          p_world_id: string;
          p_failure: Json;
        };
        Returns: string;
      };
      reject_admin_catalog_upload: {
        Args: {
          p_upload_id: string;
          p_confirmation: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      release_breeding_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_lease_token: string;
          p_error_code?: string;
        };
        Returns: Database["public"]["Enums"]["breeding_job_status"];
      };
      release_stale_breeding_jobs: {
        Args: {
          p_stale_before: string;
        };
        Returns: number;
      };
      remove_breeding_plan: {
        Args: {
          p_route_id: string;
        };
        Returns: Json;
      };
      rollback_runtime_settings: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      save_breeding_plan: {
        Args: {
          p_route_id: string;
        };
        Returns: Json;
      };
      set_pal_share_enabled: {
        Args: {
          p_pal_instance_uid: string;
          p_enabled: boolean;
        };
        Returns: boolean;
      };
      set_pal_share_enabled_for_web: {
        Args: {
          p_pal_instance_uid: string;
          p_enabled: boolean;
        };
        Returns: Json;
      };
      update_player_binding: {
        Args: {
          p_user_id: string;
          p_player_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      update_runtime_settings: {
        Args: {
          p_expected_version: number;
          p_settings: Json;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      agent_command_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "rejected"
        | "expired";
      breeding_data_status: "staging" | "validated" | "published" | "rejected";
      breeding_job_status:
        | "pending"
        | "processing"
        | "algorithm_completed"
        | "ai_enriching"
        | "retry_pending"
        | "completed"
        | "failed"
        | "cancelled";
      breeding_recipe_type: "normal" | "special";
      breeding_source_type: "github" | "url" | "upload";
      breeding_step_status:
        | "not_started"
        | "breeding"
        | "candidate_detected"
        | "completed"
        | "retrying"
        | "skipped"
        | "invalidated";
      execution_plan_status:
        | "active"
        | "awaiting_confirmation"
        | "paused"
        | "completed"
        | "invalidated"
        | "cancelled";
      game_data_entity_type:
        | "pals"
        | "passive_skills"
        | "active_skills"
        | "pal_active_skills"
        | "partner_skills"
        | "breeding_recipes"
        | "localizations";
      game_data_import_status: "staging" | "finalized";
      game_data_source_type: "game_package" | "github" | "url" | "upload";
      game_data_status:
        | "extracting"
        | "staging"
        | "validated"
        | "published"
        | "rejected";
      inventory_snapshot_status:
        | "pending"
        | "parsed"
        | "published"
        | "failed"
        | "rejected";
      optimization_mode:
        | "balanced"
        | "fastest"
        | "highest_success"
        | "least_borrowing";
      pal_gender: "male" | "female" | "genderless" | "unknown";
      pal_location_type:
        | "player_party"
        | "player_storage"
        | "base"
        | "dimensional_storage"
        | "viewing_cage"
        | "unknown";
      profile_role: "admin" | "player";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
