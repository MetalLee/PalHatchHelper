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
        };
        Insert: {
          id?: string;
          job_id: string;
          recommended_route_id?: string | null;
          ai_provider?: string;
          ai_model?: string | null;
          ai_explanation?: string | null;
          generated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          recommended_route_id?: string | null;
          ai_provider?: string;
          ai_model?: string | null;
          ai_explanation?: string | null;
          generated_at?: string;
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
        };
        Relationships: [
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
        };
        Insert: {
          version_id: string;
          parent_a_pal_id: string;
          parent_b_pal_id: string;
          child_pal_id: string;
          recipe_type: Database["public"]["Enums"]["breeding_recipe_type"];
          metadata?: Json;
        };
        Update: {
          version_id?: string;
          parent_a_pal_id?: string;
          parent_b_pal_id?: string;
          child_pal_id?: string;
          recipe_type?: Database["public"]["Enums"]["breeding_recipe_type"];
          metadata?: Json;
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
      player_bindings: {
        Row: {
          user_id: string;
          player_id: string;
          bound_by: string;
          bound_at: string;
          claim_code_hash: string | null;
        };
        Insert: {
          user_id: string;
          player_id: string;
          bound_by: string;
          bound_at?: string;
          claim_code_hash?: string | null;
        };
        Update: {
          user_id?: string;
          player_id?: string;
          bound_by?: string;
          bound_at?: string;
          claim_code_hash?: string | null;
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
        };
        Relationships: [
          {
            foreignKeyName: "step_candidates_snapshot_item_fkey";
            columns: ["detected_snapshot_id", "pal_instance_uid"];
            isOneToOne: false;
            referencedRelation: "pal_snapshot_items";
            referencedColumns: ["snapshot_id", "pal_instance_uid"];
          },
          {
            foreignKeyName: "step_offspring_candidates_confirmed_by_fkey";
            columns: ["confirmed_by"];
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
      confirm_step_offspring: {
        Args: {
          p_step_id: string;
          p_pal_instance_uid: string;
          p_detected_snapshot_id: string;
        };
        Returns: boolean;
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
      current_guild_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      current_player_id: {
        Args: Record<string, never>;
        Returns: string;
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
      get_breeding_data_diff: {
        Args: {
          p_from_version_id: string;
          p_to_version_id: string;
        };
        Returns: Json;
      };
      get_inventory_catalog_ids_for_agent: {
        Args: {
          p_world_id: string;
        };
        Returns: Json;
      };
      get_latest_inventory_snapshot_for_agent: {
        Args: {
          p_world_id: string;
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
      set_pal_share_enabled: {
        Args: {
          p_pal_instance_uid: string;
          p_enabled: boolean;
        };
        Returns: boolean;
      };
      update_breeding_step_status: {
        Args: {
          p_step_id: string;
          p_status: Database["public"]["Enums"]["breeding_step_status"];
        };
        Returns: Database["public"]["Enums"]["breeding_step_status"];
      };
    };
    Enums: {
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
        | "viewing_cage"
        | "unknown";
      profile_role: "admin" | "player";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
