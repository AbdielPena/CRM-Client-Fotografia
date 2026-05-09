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
      activity_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_name: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip: unknown
          metadata: Json
          studio_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_name?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: unknown
          metadata?: Json
          studio_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_name?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: unknown
          metadata?: Json
          studio_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_blocks: {
        Row: {
          all_day: boolean
          block_type: string
          booking_request_id: string | null
          created_at: string
          ends_at: string
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          is_confirmed: boolean
          metadata: Json
          notes: string | null
          project_id: string | null
          starts_at: string
          studio_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          block_type: string
          booking_request_id?: string | null
          created_at?: string
          ends_at: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          is_confirmed?: boolean
          metadata?: Json
          notes?: string | null
          project_id?: string | null
          starts_at: string
          studio_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          block_type?: string
          booking_request_id?: string | null
          created_at?: string
          ends_at?: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          is_confirmed?: boolean
          metadata?: Json
          notes?: string | null
          project_id?: string | null
          starts_at?: string
          studio_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          applies_to: string
          created_at: string
          day_of_week: number | null
          end_date: string | null
          end_time: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          rule_type: string
          start_date: string | null
          start_time: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          applies_to?: string
          created_at?: string
          day_of_week?: number | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          rule_type: string
          start_date?: string | null
          start_time?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          applies_to?: string
          created_at?: string
          day_of_week?: number | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          rule_type?: string
          start_date?: string | null
          start_time?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          additional_notes: string | null
          approved_at: string | null
          approved_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_email: string
          client_id: string | null
          client_name: string
          client_phone: string | null
          client_whatsapp: string | null
          conversion_started_at: string | null
          created_at: string
          event_date: string
          event_end_time: string | null
          event_location: string | null
          event_time: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          metadata: Json
          package_id: string
          package_snapshot: Json
          pricing_snapshot: Json
          project_id: string | null
          public_link_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["booking_request_status"]
          studio_id: string
          submitted_from_ip: unknown
          submitted_user_agent: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          additional_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_email: string
          client_id?: string | null
          client_name: string
          client_phone?: string | null
          client_whatsapp?: string | null
          conversion_started_at?: string | null
          created_at?: string
          event_date: string
          event_end_time?: string | null
          event_location?: string | null
          event_time?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          metadata?: Json
          package_id: string
          package_snapshot?: Json
          pricing_snapshot?: Json
          project_id?: string | null
          public_link_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["booking_request_status"]
          studio_id: string
          submitted_from_ip?: unknown
          submitted_user_agent?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          additional_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_email?: string
          client_id?: string | null
          client_name?: string
          client_phone?: string | null
          client_whatsapp?: string | null
          conversion_started_at?: string | null
          created_at?: string
          event_date?: string
          event_end_time?: string | null
          event_location?: string | null
          event_time?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          metadata?: Json
          package_id?: string
          package_snapshot?: Json
          pricing_snapshot?: Json
          project_id?: string | null
          public_link_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["booking_request_status"]
          studio_id?: string
          submitted_from_ip?: unknown
          submitted_user_agent?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_public_link_id_fkey"
            columns: ["public_link_id"]
            isOneToOne: false
            referencedRelation: "public_booking_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      client_deliveries: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deletion_reason: string | null
          delivered_at: string | null
          description: string | null
          external_links: Json
          files: Json
          gallery_id: string | null
          id: string
          project_id: string | null
          reviewed_at: string | null
          status: string
          studio_id: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          delivered_at?: string | null
          description?: string | null
          external_links?: Json
          files?: Json
          gallery_id?: string | null
          id?: string
          project_id?: string | null
          reviewed_at?: string | null
          status?: string
          studio_id: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          delivered_at?: string | null
          description?: string | null
          external_links?: Json
          files?: Json
          gallery_id?: string | null
          id?: string
          project_id?: string | null
          reviewed_at?: string | null
          status?: string
          studio_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_deliveries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_deliveries_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_deliveries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_deliveries_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_deliveries_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          created_at: string
          email: string
          email_verified_at: string | null
          id: string
          last_login_at: string | null
          name: string | null
          phone: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_verified_at?: string | null
          id?: string
          last_login_at?: string | null
          name?: string | null
          phone?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_verified_at?: string | null
          id?: string
          last_login_at?: string | null
          name?: string | null
          phone?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_users_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          access_code: string | null
          access_code_sent_at: string | null
          address: string | null
          avatar_url: string | null
          birthday: string | null
          city: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          deletion_reason: string | null
          email: string | null
          id: string
          instagram_handle: string | null
          last_portal_login_at: string | null
          name: string
          notes: string | null
          phone: string | null
          source: Database["public"]["Enums"]["lead_source"] | null
          studio_id: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          access_code?: string | null
          access_code_sent_at?: string | null
          address?: string | null
          avatar_url?: string | null
          birthday?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          email?: string | null
          id?: string
          instagram_handle?: string | null
          last_portal_login_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["lead_source"] | null
          studio_id: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          access_code?: string | null
          access_code_sent_at?: string | null
          address?: string | null
          avatar_url?: string | null
          birthday?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          email?: string | null
          id?: string
          instagram_handle?: string | null
          last_portal_login_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["lead_source"] | null
          studio_id?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          client_id: string | null
          created_at: string
          email: string | null
          id: string
          is_primary: boolean | null
          lead_id: string | null
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean | null
          lead_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean | null
          lead_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_lead_fk"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          contract_id: string
          created_at: string
          device_info: Json
          evidence_hash: string
          geolocation: Json | null
          id: string
          ip: unknown
          signature_image_url: string | null
          signature_svg: string | null
          signed_at: string
          signed_email: string
          signed_name: string
          studio_id: string
          user_agent: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          device_info?: Json
          evidence_hash: string
          geolocation?: Json | null
          id?: string
          ip: unknown
          signature_image_url?: string | null
          signature_svg?: string | null
          signed_at?: string
          signed_email: string
          signed_name: string
          studio_id: string
          user_agent: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          device_info?: Json
          evidence_hash?: string
          geolocation?: Json | null
          id?: string
          ip?: unknown
          signature_image_url?: string | null
          signature_svg?: string | null
          signed_at?: string
          signed_email?: string
          signed_name?: string
          studio_id?: string
          user_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          created_by: string | null
          default_validity_days: number
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          metadata: Json
          name: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          default_validity_days?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          default_validity_days?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          body_html: string
          body_snapshot: Json
          booking_request_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deletion_reason: string | null
          evidence_hash: string | null
          expires_at: string | null
          id: string
          metadata: Json
          pdf_url: string | null
          project_id: string
          sent_at: string | null
          signature_image_url: string | null
          signed_at: string | null
          signed_email: string | null
          signed_ip: unknown
          signed_name: string | null
          signed_user_agent: string | null
          signing_token: string
          status: Database["public"]["Enums"]["contract_status"]
          studio_id: string
          studio_signature_image_url: string | null
          studio_signed_at: string | null
          studio_signed_by_user_id: string | null
          studio_signed_name: string | null
          template_id: string | null
          title: string
          updated_at: string
          viewed_at: string | null
          viewed_ip: unknown
          viewed_user_agent: string | null
        }
        Insert: {
          body_html: string
          body_snapshot?: Json
          booking_request_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          evidence_hash?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          pdf_url?: string | null
          project_id: string
          sent_at?: string | null
          signature_image_url?: string | null
          signed_at?: string | null
          signed_email?: string | null
          signed_ip?: unknown
          signed_name?: string | null
          signed_user_agent?: string | null
          signing_token?: string
          status?: Database["public"]["Enums"]["contract_status"]
          studio_id: string
          studio_signature_image_url?: string | null
          studio_signed_at?: string | null
          studio_signed_by_user_id?: string | null
          studio_signed_name?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
          viewed_at?: string | null
          viewed_ip?: unknown
          viewed_user_agent?: string | null
        }
        Update: {
          body_html?: string
          body_snapshot?: Json
          booking_request_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          evidence_hash?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          pdf_url?: string | null
          project_id?: string
          sent_at?: string | null
          signature_image_url?: string | null
          signed_at?: string | null
          signed_email?: string | null
          signed_ip?: unknown
          signed_name?: string | null
          signed_user_agent?: string | null
          signing_token?: string
          status?: Database["public"]["Enums"]["contract_status"]
          studio_id?: string
          studio_signature_image_url?: string | null
          studio_signed_at?: string | null
          studio_signed_by_user_id?: string | null
          studio_signed_name?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
          viewed_at?: string | null
          viewed_ip?: unknown
          viewed_user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_booking_request_fk"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attachments: Json
          attempts: number
          bcc: string[] | null
          body_html: string
          body_text: string | null
          cc: string[] | null
          created_at: string
          failed_at: string | null
          from_email: string | null
          from_name: string | null
          id: string
          last_error: string | null
          max_attempts: number
          metadata: Json
          provider: string | null
          provider_message_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          reply_to: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_queue_status"]
          studio_id: string
          subject: string
          template_slug: string | null
          to_email: string
          to_name: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          attempts?: number
          bcc?: string[] | null
          body_html: string
          body_text?: string | null
          cc?: string[] | null
          created_at?: string
          failed_at?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          reply_to?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_queue_status"]
          studio_id: string
          subject: string
          template_slug?: string | null
          to_email: string
          to_name?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          attempts?: number
          bcc?: string[] | null
          body_html?: string
          body_text?: string | null
          cc?: string[] | null
          created_at?: string
          failed_at?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          reply_to?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_queue_status"]
          studio_id?: string
          subject?: string
          template_slug?: string | null
          to_email?: string
          to_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          from_name: string | null
          id: string
          is_active: boolean
          is_system: boolean
          metadata: Json
          name: string
          reply_to: string | null
          slug: string
          studio_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          from_name?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          metadata?: Json
          name: string
          reply_to?: string | null
          slug: string
          studio_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          from_name?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          metadata?: Json
          name?: string
          reply_to?: string | null
          slug?: string
          studio_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      form_attachments: {
        Row: {
          created_at: string
          field_key: string
          file_name: string
          file_size_bytes: number | null
          file_url: string
          form_response_id: string
          id: string
          metadata: Json
          mime_type: string | null
          studio_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          form_response_id: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          studio_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          form_response_id?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_attachments_form_response_id_fkey"
            columns: ["form_response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_attachments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_attachments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      form_responses: {
        Row: {
          access_token: string
          attachments_count: number
          booking_request_id: string | null
          client_email: string
          completed_at: string | null
          created_at: string
          data: Json
          expires_at: string | null
          first_viewed_at: string | null
          form_template_id: string
          id: string
          metadata: Json
          project_id: string | null
          schema_snapshot: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["form_status"]
          studio_id: string
          updated_at: string
        }
        Insert: {
          access_token?: string
          attachments_count?: number
          booking_request_id?: string | null
          client_email: string
          completed_at?: string | null
          created_at?: string
          data?: Json
          expires_at?: string | null
          first_viewed_at?: string | null
          form_template_id: string
          id?: string
          metadata?: Json
          project_id?: string | null
          schema_snapshot: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["form_status"]
          studio_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          attachments_count?: number
          booking_request_id?: string | null
          client_email?: string
          completed_at?: string | null
          created_at?: string
          data?: Json
          expires_at?: string | null
          first_viewed_at?: string | null
          form_template_id?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          schema_snapshot?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["form_status"]
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          metadata: Json
          name: string
          schema: Json
          studio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name: string
          schema: Json
          studio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name?: string
          schema?: Json
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      galleries: {
        Row: {
          accent_color: string
          allow_download: boolean
          asset_count: number
          client_id: string | null
          cover_asset_id: string | null
          cover_design: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deletion_reason: string | null
          description: string | null
          download_pin_required: boolean
          event_date: string | null
          expires_at: string | null
          id: string
          layout_grid: string
          name: string
          password_hash: string | null
          project_id: string | null
          require_email: boolean
          selection_enabled: boolean
          selection_locked: boolean
          selection_submitted: boolean
          selection_submitted_at: string | null
          selection_submitted_by: string | null
          slug: string
          status: Database["public"]["Enums"]["gallery_status"]
          studio_id: string
          tags: string[]
          updated_at: string
          visibility: Database["public"]["Enums"]["gallery_visibility"]
          watermark_enabled: boolean
          watermark_image_key: string | null
          watermark_mode: string | null
          watermark_opacity: number
          watermark_position: string
          watermark_text: string | null
        }
        Insert: {
          accent_color?: string
          allow_download?: boolean
          asset_count?: number
          client_id?: string | null
          cover_asset_id?: string | null
          cover_design?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          description?: string | null
          download_pin_required?: boolean
          event_date?: string | null
          expires_at?: string | null
          id?: string
          layout_grid?: string
          name: string
          password_hash?: string | null
          project_id?: string | null
          require_email?: boolean
          selection_enabled?: boolean
          selection_locked?: boolean
          selection_submitted?: boolean
          selection_submitted_at?: string | null
          selection_submitted_by?: string | null
          slug: string
          status?: Database["public"]["Enums"]["gallery_status"]
          studio_id: string
          tags?: string[]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["gallery_visibility"]
          watermark_enabled?: boolean
          watermark_image_key?: string | null
          watermark_mode?: string | null
          watermark_opacity?: number
          watermark_position?: string
          watermark_text?: string | null
        }
        Update: {
          accent_color?: string
          allow_download?: boolean
          asset_count?: number
          client_id?: string | null
          cover_asset_id?: string | null
          cover_design?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          description?: string | null
          download_pin_required?: boolean
          event_date?: string | null
          expires_at?: string | null
          id?: string
          layout_grid?: string
          name?: string
          password_hash?: string | null
          project_id?: string | null
          require_email?: boolean
          selection_enabled?: boolean
          selection_locked?: boolean
          selection_submitted?: boolean
          selection_submitted_at?: string | null
          selection_submitted_by?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["gallery_status"]
          studio_id?: string
          tags?: string[]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["gallery_visibility"]
          watermark_enabled?: boolean
          watermark_image_key?: string | null
          watermark_mode?: string | null
          watermark_opacity?: number
          watermark_position?: string
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "galleries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_cover_fk"
            columns: ["cover_asset_id"]
            isOneToOne: false
            referencedRelation: "gallery_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_assets: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_size: number
          filename: string
          gallery_id: string
          height: number | null
          id: string
          is_private: boolean
          metadata: Json | null
          mime_type: string
          original_key: string | null
          original_name: string
          set_id: string | null
          sort_order: number
          status: Database["public"]["Enums"]["asset_processing_status"]
          studio_id: string
          thumb_key: string | null
          updated_at: string
          web_key: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_size: number
          filename: string
          gallery_id: string
          height?: number | null
          id?: string
          is_private?: boolean
          metadata?: Json | null
          mime_type: string
          original_key?: string | null
          original_name: string
          set_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["asset_processing_status"]
          studio_id: string
          thumb_key?: string | null
          updated_at?: string
          web_key?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_size?: number
          filename?: string
          gallery_id?: string
          height?: number | null
          id?: string
          is_private?: boolean
          metadata?: Json | null
          mime_type?: string
          original_key?: string | null
          original_name?: string
          set_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["asset_processing_status"]
          studio_id?: string
          thumb_key?: string | null
          updated_at?: string
          web_key?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_assets_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_assets_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "gallery_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_assets_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_assets_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_collection_items: {
        Row: {
          asset_id: string
          collection_id: string
          created_at: string
          id: string
          sort_order: number
        }
        Insert: {
          asset_id: string
          collection_id: string
          created_at?: string
          id?: string
          sort_order?: number
        }
        Update: {
          asset_id?: string
          collection_id?: string
          created_at?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gallery_collection_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "gallery_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "gallery_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_collections: {
        Row: {
          asset_count: number
          client_email: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          gallery_id: string
          id: string
          is_client_editable: boolean
          is_locked: boolean
          name: string
          studio_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          asset_count?: number
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          gallery_id: string
          id?: string
          is_client_editable?: boolean
          is_locked?: boolean
          name: string
          studio_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          asset_count?: number
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          gallery_id?: string
          id?: string
          is_client_editable?: boolean
          is_locked?: boolean
          name?: string
          studio_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_collections_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_collections_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_collections_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_download_pins: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          gallery_id: string
          id: string
          label: string | null
          last_used_at: string | null
          max_downloads: number
          pin_hash: string
          pin_last4: string
          resolution: string
          revoked_at: string | null
          studio_id: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          gallery_id: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          max_downloads?: number
          pin_hash: string
          pin_last4: string
          resolution?: string
          revoked_at?: string | null
          studio_id: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          gallery_id?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          max_downloads?: number
          pin_hash?: string
          pin_last4?: string
          resolution?: string
          revoked_at?: string | null
          studio_id?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "gallery_download_pins_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_download_pins_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_download_pins_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_downloads: {
        Row: {
          asset_id: string | null
          client_email: string | null
          client_ip: string | null
          created_at: string
          gallery_id: string
          id: string
          resolution: string
          scope: string
          user_agent: string | null
        }
        Insert: {
          asset_id?: string | null
          client_email?: string | null
          client_ip?: string | null
          created_at?: string
          gallery_id: string
          id?: string
          resolution: string
          scope: string
          user_agent?: string | null
        }
        Update: {
          asset_id?: string | null
          client_email?: string | null
          client_ip?: string | null
          created_at?: string
          gallery_id?: string
          id?: string
          resolution?: string
          scope?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_downloads_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "gallery_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_downloads_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_favorites: {
        Row: {
          asset_id: string
          client_email: string | null
          client_name: string | null
          created_at: string
          gallery_id: string
          id: string
        }
        Insert: {
          asset_id: string
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          gallery_id: string
          id?: string
        }
        Update: {
          asset_id?: string
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          gallery_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_favorites_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "gallery_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_favorites_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_sets: {
        Row: {
          asset_count: number
          cover_asset_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          gallery_id: string
          id: string
          is_private: boolean
          name: string
          sort_order: number
          studio_id: string
          updated_at: string
        }
        Insert: {
          asset_count?: number
          cover_asset_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          gallery_id: string
          id?: string
          is_private?: boolean
          name: string
          sort_order?: number
          studio_id: string
          updated_at?: string
        }
        Update: {
          asset_count?: number
          cover_asset_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          gallery_id?: string
          id?: string
          is_private?: boolean
          name?: string
          sort_order?: number
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_sets_cover_asset_id_fkey"
            columns: ["cover_asset_id"]
            isOneToOne: false
            referencedRelation: "gallery_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_sets_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_sets_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_sets_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_share_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          gallery_id: string
          id: string
          last_viewed_at: string | null
          revoked_at: string | null
          studio_id: string
          token: string
          view_count: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          gallery_id: string
          id?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          studio_id: string
          token: string
          view_count?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          gallery_id?: string
          id?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          studio_id?: string
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "gallery_share_tokens_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_share_tokens_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_share_tokens_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_zip_exports: {
        Row: {
          asset_count: number
          asset_ids: string[] | null
          client_email: string | null
          client_ip: string | null
          collection_id: string | null
          created_at: string
          error_message: string | null
          expires_at: string | null
          gallery_id: string
          id: string
          requested_by_user_id: string | null
          resolution: string
          scope: Database["public"]["Enums"]["zip_export_scope"]
          status: Database["public"]["Enums"]["zip_export_status"]
          studio_id: string
          updated_at: string
          zip_key: string | null
          zip_size: number | null
        }
        Insert: {
          asset_count?: number
          asset_ids?: string[] | null
          client_email?: string | null
          client_ip?: string | null
          collection_id?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          gallery_id: string
          id?: string
          requested_by_user_id?: string | null
          resolution?: string
          scope: Database["public"]["Enums"]["zip_export_scope"]
          status?: Database["public"]["Enums"]["zip_export_status"]
          studio_id: string
          updated_at?: string
          zip_key?: string | null
          zip_size?: number | null
        }
        Update: {
          asset_count?: number
          asset_ids?: string[] | null
          client_email?: string | null
          client_ip?: string | null
          collection_id?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          gallery_id?: string
          id?: string
          requested_by_user_id?: string | null
          resolution?: string
          scope?: Database["public"]["Enums"]["zip_export_scope"]
          status?: Database["public"]["Enums"]["zip_export_status"]
          studio_id?: string
          updated_at?: string
          zip_key?: string | null
          zip_size?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_zip_exports_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "gallery_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_zip_exports_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_zip_exports_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_zip_exports_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_watches: {
        Row: {
          calendar_id: string
          channel_id: string
          created_at: string
          expires_at: string
          id: string
          resource_id: string
          studio_id: string
          sync_token: string | null
          updated_at: string
        }
        Insert: {
          calendar_id: string
          channel_id: string
          created_at?: string
          expires_at: string
          id?: string
          resource_id: string
          studio_id: string
          sync_token?: string | null
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          channel_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          resource_id?: string
          studio_id?: string
          sync_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_watches_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_watches_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      google_events: {
        Row: {
          attendees: Json | null
          booking_request_id: string | null
          client_id: string | null
          color_override: string | null
          contract_id: string | null
          created_at: string | null
          delivery_id: string | null
          description: string | null
          ends_at: string | null
          gallery_id: string | null
          google_calendar_id: string
          google_event_id: string
          html_link: string | null
          id: string
          invoice_id: string | null
          is_all_day: boolean | null
          is_hidden: boolean | null
          last_synced_at: string | null
          location: string | null
          origin: string
          project_id: string | null
          starts_at: string | null
          status: string | null
          studio_id: string
          summary: string | null
          sync_error: string | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          attendees?: Json | null
          booking_request_id?: string | null
          client_id?: string | null
          color_override?: string | null
          contract_id?: string | null
          created_at?: string | null
          delivery_id?: string | null
          description?: string | null
          ends_at?: string | null
          gallery_id?: string | null
          google_calendar_id: string
          google_event_id: string
          html_link?: string | null
          id?: string
          invoice_id?: string | null
          is_all_day?: boolean | null
          is_hidden?: boolean | null
          last_synced_at?: string | null
          location?: string | null
          origin?: string
          project_id?: string | null
          starts_at?: string | null
          status?: string | null
          studio_id: string
          summary?: string | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          attendees?: Json | null
          booking_request_id?: string | null
          client_id?: string | null
          color_override?: string | null
          contract_id?: string | null
          created_at?: string | null
          delivery_id?: string | null
          description?: string | null
          ends_at?: string | null
          gallery_id?: string | null
          google_calendar_id?: string
          google_event_id?: string
          html_link?: string | null
          id?: string
          invoice_id?: string | null
          is_all_day?: boolean | null
          is_hidden?: boolean | null
          last_synced_at?: string | null
          location?: string | null
          origin?: string
          project_id?: string | null
          starts_at?: string | null
          status?: string | null
          studio_id?: string
          summary?: string | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_events_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "client_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_events_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_events_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_events_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          metadata: Json
          quantity: number
          sort_order: number
          studio_id: string
          unit_price: number
        }
        Insert: {
          amount?: number | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          metadata?: Json
          quantity?: number
          sort_order?: number
          studio_id: string
          unit_price?: number
        }
        Update: {
          amount?: number | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          metadata?: Json
          quantity?: number
          sort_order?: number
          studio_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          current_value: number
          studio_id: string
          updated_at: string
        }
        Insert: {
          current_value?: number
          studio_id: string
          updated_at?: string
        }
        Update: {
          current_value?: number
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_sequences_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number | null
          booking_request_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deletion_reason: string | null
          description: string | null
          discount_amount: number
          due_date: string | null
          id: string
          installment_number: number | null
          installment_total: number | null
          invoice_number: string
          issued_at: string | null
          kind: string
          metadata: Json
          notes: string | null
          paid_at: string | null
          pdf_url: string | null
          project_id: string
          sent_at: string | null
          sequence_number: number
          status: Database["public"]["Enums"]["invoice_status"]
          studio_id: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          title: string | null
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          balance_due?: number | null
          booking_request_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          description?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          invoice_number: string
          issued_at?: string | null
          kind?: string
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          project_id: string
          sent_at?: string | null
          sequence_number: number
          status?: Database["public"]["Enums"]["invoice_status"]
          studio_id: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          title?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          balance_due?: number | null
          booking_request_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          description?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          invoice_number?: string
          issued_at?: string | null
          kind?: string
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          project_id?: string
          sent_at?: string | null
          sequence_number?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          studio_id?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          title?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_request_fk"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          budget: number | null
          converted_at: string | null
          converted_to_client_id: string | null
          created_at: string
          currency: string | null
          deleted_at: string | null
          email: string | null
          event_date: string | null
          event_type: string | null
          id: string
          inquiry_form_id: string | null
          name: string
          notes: string | null
          phone: string | null
          referral: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          studio_id: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          converted_at?: string | null
          converted_to_client_id?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          email?: string | null
          event_date?: string | null
          event_type?: string | null
          id?: string
          inquiry_form_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          referral?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          studio_id: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          converted_at?: string | null
          converted_to_client_id?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          email?: string | null
          event_date?: string | null
          event_type?: string | null
          id?: string
          inquiry_form_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          referral?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_to_client_id_fkey"
            columns: ["converted_to_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          author_id: string | null
          booking_request_id: string | null
          client_id: string | null
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          lead_id: string | null
          project_id: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          booking_request_id?: string | null
          client_id?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_id?: string | null
          project_id?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          booking_request_id?: string | null
          client_id?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_id?: string | null
          project_id?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          metadata: Json
          read_at: string | null
          recipient_role: Database["public"]["Enums"]["studio_role"] | null
          recipient_user_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          studio_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["studio_role"] | null
          recipient_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          studio_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["studio_role"] | null
          recipient_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          studio_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      package_forms: {
        Row: {
          created_at: string
          form_template_id: string
          id: string
          is_required: boolean
          package_id: string
          sort_order: number
          studio_id: string
        }
        Insert: {
          created_at?: string
          form_template_id: string
          id?: string
          is_required?: boolean
          package_id: string
          sort_order?: number
          studio_id: string
        }
        Update: {
          created_at?: string
          form_template_id?: string
          id?: string
          is_required?: boolean
          package_id?: string
          sort_order?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_forms_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_forms_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_forms_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_forms_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_forms_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          cover_image_url: string | null
          created_at: string
          currency: string
          default_contract_template_id: string | null
          default_form_template_id: string | null
          deleted_at: string | null
          deposit_percent: number | null
          description: string | null
          duration_hours: number | null
          edited_photos: number | null
          event_type: string | null
          extra_photo_price: number | null
          gallery_images: Json | null
          id: string
          includes: Json | null
          is_active: boolean | null
          long_description: string | null
          name: string
          price: number
          reserve_due_in_days: number | null
          slug: string
          sort_order: number | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          default_contract_template_id?: string | null
          default_form_template_id?: string | null
          deleted_at?: string | null
          deposit_percent?: number | null
          description?: string | null
          duration_hours?: number | null
          edited_photos?: number | null
          event_type?: string | null
          extra_photo_price?: number | null
          gallery_images?: Json | null
          id?: string
          includes?: Json | null
          is_active?: boolean | null
          long_description?: string | null
          name: string
          price: number
          reserve_due_in_days?: number | null
          slug: string
          sort_order?: number | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          default_contract_template_id?: string | null
          default_form_template_id?: string | null
          deleted_at?: string | null
          deposit_percent?: number | null
          description?: string | null
          duration_hours?: number | null
          edited_photos?: number | null
          event_type?: string | null
          extra_photo_price?: number | null
          gallery_images?: Json | null
          id?: string
          includes?: Json | null
          is_active?: boolean | null
          long_description?: string | null
          name?: string
          price?: number
          reserve_due_in_days?: number | null
          slug?: string
          sort_order?: number | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          external_payment_id: string | null
          id: string
          invoice_id: string
          metadata: Json
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          project_id: string
          proof_url: string | null
          received_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          studio_id: string
          transaction_reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          external_payment_id?: string | null
          id?: string
          invoice_id: string
          metadata?: Json
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          project_id: string
          proof_url?: string | null
          received_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          studio_id: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          external_payment_id?: string | null
          id?: string
          invoice_id?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          project_id?: string
          proof_url?: string | null
          received_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          studio_id?: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          is_enabled: boolean
          limit_value: number | null
          metadata: Json
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          is_enabled?: boolean
          limit_value?: number | null
          metadata?: Json
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          is_enabled?: boolean
          limit_value?: number | null
          metadata?: Json
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          price_monthly_dop: number
          price_monthly_usd: number
          price_yearly_dop: number
          price_yearly_usd: number
          slug: string
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          price_monthly_dop?: number
          price_monthly_usd?: number
          price_yearly_dop?: number
          price_yearly_usd?: number
          slug: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          price_monthly_dop?: number
          price_monthly_usd?: number
          price_yearly_dop?: number
          price_yearly_usd?: number
          slug?: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          position: number
          studio_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          position?: number
          studio_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          position?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_statuses_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_statuses_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          color: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          deletion_reason: string | null
          event_date: string | null
          event_end_time: string | null
          event_time: string | null
          event_type: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          google_sync_error: string | null
          google_synced_at: string | null
          id: string
          location: string | null
          name: string
          notes: string | null
          package_id: string | null
          status: string
          studio_id: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          color?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          event_date?: string | null
          event_end_time?: string | null
          event_time?: string | null
          event_type?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_sync_error?: string | null
          google_synced_at?: string | null
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          package_id?: string | null
          status?: string
          studio_id: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          color?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          event_date?: string | null
          event_end_time?: string | null
          event_time?: string | null
          event_type?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_sync_error?: string | null
          google_synced_at?: string | null
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          package_id?: string | null
          status?: string
          studio_id?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      public_booking_links: {
        Row: {
          auto_expire_days: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          metadata: Json
          package_id: string
          requires_approval: boolean
          slug: string
          studio_id: string
          submission_count: number
          updated_at: string
          view_count: number
        }
        Insert: {
          auto_expire_days?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          package_id: string
          requires_approval?: boolean
          slug: string
          studio_id: string
          submission_count?: number
          updated_at?: string
          view_count?: number
        }
        Update: {
          auto_expire_days?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          package_id?: string
          requires_approval?: boolean
          slug?: string
          studio_id?: string
          submission_count?: number
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_booking_links_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_booking_links_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_booking_links_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_booking_links_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_domains: {
        Row: {
          created_at: string
          dns_target: string | null
          domain: string
          id: string
          is_primary: boolean
          last_check_at: string | null
          last_error: string | null
          metadata: Json
          ssl_expires_at: string | null
          ssl_issued_at: string | null
          ssl_status: string | null
          status: Database["public"]["Enums"]["domain_status"]
          studio_id: string
          type: Database["public"]["Enums"]["domain_type"]
          updated_at: string
          verification_method: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          dns_target?: string | null
          domain: string
          id?: string
          is_primary?: boolean
          last_check_at?: string | null
          last_error?: string | null
          metadata?: Json
          ssl_expires_at?: string | null
          ssl_issued_at?: string | null
          ssl_status?: string | null
          status?: Database["public"]["Enums"]["domain_status"]
          studio_id: string
          type?: Database["public"]["Enums"]["domain_type"]
          updated_at?: string
          verification_method?: string
          verification_token?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          dns_target?: string | null
          domain?: string
          id?: string
          is_primary?: boolean
          last_check_at?: string | null
          last_error?: string | null
          metadata?: Json
          ssl_expires_at?: string | null
          ssl_issued_at?: string | null
          ssl_status?: string | null
          status?: Database["public"]["Enums"]["domain_status"]
          studio_id?: string
          type?: Database["public"]["Enums"]["domain_type"]
          updated_at?: string
          verification_method?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_domains_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_domains_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_feature_overrides: {
        Row: {
          created_at: string
          expires_at: string | null
          feature_key: string
          granted_at: string
          granted_by: string
          id: string
          is_enabled: boolean
          limit_value: number | null
          reason: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          feature_key: string
          granted_at?: string
          granted_by: string
          id?: string
          is_enabled?: boolean
          limit_value?: number | null
          reason?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          feature_key?: string
          granted_at?: string
          granted_by?: string
          id?: string
          is_enabled?: boolean
          limit_value?: number | null
          reason?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_feature_overrides_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_feature_overrides_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          last_error: string | null
          last_error_at: string | null
          last_verified_at: string | null
          last_verified_by: string | null
          metadata: Json
          service: Database["public"]["Enums"]["integration_service"]
          studio_id: string
          updated_at: string
          vault_secret_ids: Json
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_verified_at?: string | null
          last_verified_by?: string | null
          metadata?: Json
          service: Database["public"]["Enums"]["integration_service"]
          studio_id: string
          updated_at?: string
          vault_secret_ids?: Json
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_verified_at?: string | null
          last_verified_by?: string | null
          metadata?: Json
          service?: Database["public"]["Enums"]["integration_service"]
          studio_id?: string
          updated_at?: string
          vault_secret_ids?: Json
        }
        Relationships: [
          {
            foreignKeyName: "studio_integrations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_integrations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          invited_at: string | null
          is_active: boolean
          joined_at: string | null
          role: Database["public"]["Enums"]["studio_role"]
          studio_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          invited_at?: string | null
          is_active?: boolean
          joined_at?: string | null
          role?: Database["public"]["Enums"]["studio_role"]
          studio_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          invited_at?: string | null
          is_active?: boolean
          joined_at?: string | null
          role?: Database["public"]["Enums"]["studio_role"]
          studio_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_members_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_members_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          external_customer_id: string | null
          external_subscription_id: string | null
          id: string
          notes: string | null
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          studio_id: string
          suspended_at: string | null
          suspended_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          studio_id: string
          suspended_at?: string | null
          suspended_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          studio_id?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_subscriptions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_subscriptions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      studios: {
        Row: {
          address: string | null
          city: string | null
          contract_footer: string | null
          country: string | null
          created_at: string
          currency: string
          default_event_type: string | null
          deleted_at: string | null
          email: string | null
          id: string
          invoice_footer: string | null
          invoice_prefix: string | null
          is_suspended: boolean
          locale: string
          logo_url: string | null
          name: string
          phone: string | null
          plan: Database["public"]["Enums"]["plan_type"] | null
          plan_expires_at: string | null
          plan_id: string | null
          primary_color: string | null
          secondary_color: string | null
          signature_image_url: string | null
          slug: string
          storage_limit_bytes: number | null
          storage_used_bytes: number | null
          suspended_at: string | null
          suspended_reason: string | null
          tax_id: string | null
          tax_label: string | null
          tax_rate: number | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contract_footer?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          default_event_type?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_prefix?: string | null
          is_suspended?: boolean
          locale?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_type"] | null
          plan_expires_at?: string | null
          plan_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          signature_image_url?: string | null
          slug: string
          storage_limit_bytes?: number | null
          storage_used_bytes?: number | null
          suspended_at?: string | null
          suspended_reason?: string | null
          tax_id?: string | null
          tax_label?: string | null
          tax_rate?: number | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contract_footer?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          default_event_type?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_prefix?: string | null
          is_suspended?: boolean
          locale?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_type"] | null
          plan_expires_at?: string | null
          plan_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          signature_image_url?: string | null
          slug?: string
          storage_limit_bytes?: number | null
          storage_used_bytes?: number | null
          suspended_at?: string | null
          suspended_reason?: string | null
          tax_id?: string | null
          tax_label?: string | null
          tax_rate?: number | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studios_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_assignments: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          project_id: string | null
          studio_id: string
          tag_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          project_id?: string | null
          studio_id: string
          tag_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          project_id?: string | null
          studio_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          studio_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          studio_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      packages_public: {
        Row: {
          cover_image_url: string | null
          currency: string | null
          deposit_percent: number | null
          description: string | null
          duration_hours: number | null
          edited_photos: number | null
          event_type: string | null
          gallery_images: Json | null
          id: string | null
          includes: Json | null
          long_description: string | null
          name: string | null
          price: number | null
          reserve_due_in_days: number | null
          slug: string | null
          studio_id: string | null
        }
        Insert: {
          cover_image_url?: string | null
          currency?: string | null
          deposit_percent?: number | null
          description?: string | null
          duration_hours?: number | null
          edited_photos?: number | null
          event_type?: string | null
          gallery_images?: Json | null
          id?: string | null
          includes?: Json | null
          long_description?: string | null
          name?: string | null
          price?: number | null
          reserve_due_in_days?: number | null
          slug?: string | null
          studio_id?: string | null
        }
        Update: {
          cover_image_url?: string | null
          currency?: string | null
          deposit_percent?: number | null
          description?: string | null
          duration_hours?: number | null
          edited_photos?: number | null
          event_type?: string | null
          gallery_images?: Json | null
          id?: string | null
          includes?: Json | null
          long_description?: string | null
          name?: string | null
          price?: number | null
          reserve_due_in_days?: number | null
          slug?: string | null
          studio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_public"
            referencedColumns: ["id"]
          },
        ]
      }
      studios_public: {
        Row: {
          city: string | null
          country: string | null
          currency: string | null
          email: string | null
          id: string | null
          locale: string | null
          logo_url: string | null
          name: string | null
          phone: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string | null
          timezone: string | null
          website: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          currency?: string | null
          email?: string | null
          id?: string | null
          locale?: string | null
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string | null
          timezone?: string | null
          website?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          currency?: string | null
          email?: string | null
          id?: string | null
          locale?: string | null
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string | null
          timezone?: string | null
          website?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_asset_to_collection_atomic: {
        Args: { p_asset_id: string; p_collection_id: string }
        Returns: string
      }
      auth_is_admin_or_owner: { Args: never; Returns: boolean }
      auth_is_platform_admin: { Args: never; Returns: boolean }
      auth_is_staff_or_above: { Args: never; Returns: boolean }
      auth_studio_id: { Args: never; Returns: string }
      auth_studio_role: {
        Args: never
        Returns: Database["public"]["Enums"]["studio_role"]
      }
      auto_purge_trash_30d: {
        Args: never
        Returns: {
          entity_type: string
          purged_count: number
        }[]
      }
      bootstrap_studio_for_current_user: {
        Args: {
          p_currency?: string
          p_event_type?: string
          p_owner_name?: string
          p_slug?: string
          p_studio_name: string
          p_timezone?: string
        }
        Returns: Json
      }
      cascade_delete_client: {
        Args: { p_client_id: string; p_reason?: string; p_studio_id: string }
        Returns: undefined
      }
      cascade_delete_package: {
        Args: { p_package_id: string; p_studio_id: string }
        Returns: undefined
      }
      cascade_delete_project: {
        Args: { p_project_id: string; p_studio_id: string }
        Returns: undefined
      }
      cascade_hard_delete_client: {
        Args: { p_client_id: string; p_studio_id: string }
        Returns: undefined
      }
      cascade_restore_client: {
        Args: { p_client_id: string; p_studio_id: string }
        Returns: undefined
      }
      create_client_with_booking: {
        Args: { p_payload: Json; p_studio_id: string }
        Returns: Json
      }
      get_current_user_context: { Args: never; Returns: Json }
      hard_delete_contract: {
        Args: { p_contract_id: string; p_studio_id: string }
        Returns: undefined
      }
      hard_delete_delivery: {
        Args: { p_delivery_id: string; p_studio_id: string }
        Returns: undefined
      }
      hard_delete_gallery: {
        Args: { p_gallery_id: string; p_studio_id: string }
        Returns: undefined
      }
      hard_delete_invoice: {
        Args: { p_invoice_id: string; p_studio_id: string }
        Returns: undefined
      }
      hard_delete_project: {
        Args: { p_project_id: string; p_studio_id: string }
        Returns: undefined
      }
      has_availability_conflict: {
        Args: {
          p_ends_at: string
          p_exclude_block_id?: string
          p_starts_at: string
          p_studio_id: string
        }
        Returns: boolean
      }
      is_studio_member: { Args: { p_studio: string }; Returns: boolean }
      next_invoice_number: {
        Args: { p_prefix?: string; p_studio_id: string }
        Returns: string
      }
      public_register_client: {
        Args: {
          p_email: string
          p_name: string
          p_notes: string
          p_phone: string
          p_studio_slug: string
        }
        Returns: Json
      }
      request_has_valid_token: { Args: { p_token: string }; Returns: boolean }
      restore_contract: {
        Args: { p_contract_id: string; p_studio_id: string }
        Returns: undefined
      }
      restore_delivery: {
        Args: { p_delivery_id: string; p_studio_id: string }
        Returns: undefined
      }
      restore_gallery: {
        Args: { p_gallery_id: string; p_studio_id: string }
        Returns: undefined
      }
      restore_invoice: {
        Args: { p_invoice_id: string; p_studio_id: string }
        Returns: undefined
      }
      restore_project: {
        Args: { p_project_id: string; p_studio_id: string }
        Returns: undefined
      }
      retry_failed_emails: { Args: never; Returns: number }
      soft_delete_contract: {
        Args: { p_contract_id: string; p_reason?: string; p_studio_id: string }
        Returns: undefined
      }
      soft_delete_delivery: {
        Args: { p_delivery_id: string; p_reason?: string; p_studio_id: string }
        Returns: undefined
      }
      soft_delete_gallery: {
        Args: { p_gallery_id: string; p_reason?: string; p_studio_id: string }
        Returns: undefined
      }
      soft_delete_invoice: {
        Args: { p_invoice_id: string; p_reason?: string; p_studio_id: string }
        Returns: undefined
      }
      soft_delete_project: {
        Args: { p_project_id: string; p_reason?: string; p_studio_id: string }
        Returns: undefined
      }
      storage_studio_id_from_path: { Args: { p_name: string }; Returns: string }
      studio_has_feature: {
        Args: { p_feature_key: string; p_studio_id: string }
        Returns: boolean
      }
      studio_is_active: { Args: { p_studio_id: string }; Returns: boolean }
      studio_within_limit: {
        Args: {
          p_current_count: number
          p_feature_key: string
          p_studio_id: string
        }
        Returns: boolean
      }
      trigger_email_worker: { Args: never; Returns: undefined }
    }
    Enums: {
      actor_type: "user" | "client" | "system"
      asset_processing_status: "pending" | "processing" | "completed" | "failed"
      booking_request_status:
        | "pending_review"
        | "approved"
        | "rejected"
        | "awaiting_payment"
        | "confirmed"
        | "scheduled"
        | "completed"
        | "cancelled"
      booking_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled"
      contract_status:
        | "draft"
        | "sent"
        | "viewed"
        | "signed"
        | "expired"
        | "cancelled"
        | "voided"
      domain_status: "pending" | "verifying" | "active" | "failed" | "disabled"
      domain_type: "subdomain" | "custom"
      email_queue_status:
        | "pending"
        | "retrying"
        | "sending"
        | "sent"
        | "failed"
        | "bounced"
        | "cancelled"
      form_status: "pending" | "sent" | "in_progress" | "completed" | "expired"
      gallery_status: "draft" | "published" | "archived" | "expired"
      gallery_visibility: "public" | "private" | "password"
      integration_service:
        | "resend"
        | "google_calendar"
        | "google_oauth"
        | "custom_domain"
        | "payment_azul"
        | "payment_cardnet"
        | "payment_stripe"
        | "storage_s3"
        | "webhook"
      invoice_status:
        | "draft"
        | "sent"
        | "viewed"
        | "pending"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "cancelled"
      lead_source:
        | "manual"
        | "inquiry_form"
        | "referral"
        | "social_media"
        | "website"
        | "email"
        | "whatsapp"
        | "instagram"
        | "public_link"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "meeting_scheduled"
        | "proposal_sent"
        | "negotiating"
        | "won"
        | "lost"
        | "archived"
      notification_type:
        | "booking_request_received"
        | "booking_approved"
        | "booking_rejected"
        | "contract_sent"
        | "contract_viewed"
        | "contract_signed"
        | "form_sent"
        | "form_completed"
        | "invoice_generated"
        | "invoice_viewed"
        | "invoice_paid"
        | "invoice_overdue"
        | "session_confirmed"
        | "session_rescheduled"
        | "session_cancelled"
        | "session_reminder"
        | "calendar_event_created"
        | "calendar_event_updated"
        | "payment_received"
        | "system"
        | "mention"
        | "comment"
        | "client_registered"
        | "gallery_selection_submitted"
        | "client_portal_login"
        | "delivery_ready"
        | "delivery_reviewed"
        | "gallery_selection_over_limit"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "zelle"
        | "paypal"
        | "stripe"
        | "azul"
        | "cardnet"
        | "check"
        | "other"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      plan_type: "free" | "basic" | "pro" | "unlimited"
      project_status:
        | "inquiry"
        | "booked"
        | "in_progress"
        | "session_done"
        | "awaiting_selection"
        | "production"
        | "prints_sent"
        | "editing"
        | "delivered"
        | "archived"
        | "cancelled"
      studio_role: "owner" | "admin" | "staff" | "finance" | "viewer"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "suspended"
        | "cancelled"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed" | "cancelled"
      zip_export_scope: "gallery" | "collection" | "selection"
      zip_export_status:
        | "pending"
        | "processing"
        | "ready"
        | "failed"
        | "expired"
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
      actor_type: ["user", "client", "system"],
      asset_processing_status: ["pending", "processing", "completed", "failed"],
      booking_request_status: [
        "pending_review",
        "approved",
        "rejected",
        "awaiting_payment",
        "confirmed",
        "scheduled",
        "completed",
        "cancelled",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
        "rescheduled",
      ],
      contract_status: [
        "draft",
        "sent",
        "viewed",
        "signed",
        "expired",
        "cancelled",
        "voided",
      ],
      domain_status: ["pending", "verifying", "active", "failed", "disabled"],
      domain_type: ["subdomain", "custom"],
      email_queue_status: [
        "pending",
        "retrying",
        "sending",
        "sent",
        "failed",
        "bounced",
        "cancelled",
      ],
      form_status: ["pending", "sent", "in_progress", "completed", "expired"],
      gallery_status: ["draft", "published", "archived", "expired"],
      gallery_visibility: ["public", "private", "password"],
      integration_service: [
        "resend",
        "google_calendar",
        "google_oauth",
        "custom_domain",
        "payment_azul",
        "payment_cardnet",
        "payment_stripe",
        "storage_s3",
        "webhook",
      ],
      invoice_status: [
        "draft",
        "sent",
        "viewed",
        "pending",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
      ],
      lead_source: [
        "manual",
        "inquiry_form",
        "referral",
        "social_media",
        "website",
        "email",
        "whatsapp",
        "instagram",
        "public_link",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "meeting_scheduled",
        "proposal_sent",
        "negotiating",
        "won",
        "lost",
        "archived",
      ],
      notification_type: [
        "booking_request_received",
        "booking_approved",
        "booking_rejected",
        "contract_sent",
        "contract_viewed",
        "contract_signed",
        "form_sent",
        "form_completed",
        "invoice_generated",
        "invoice_viewed",
        "invoice_paid",
        "invoice_overdue",
        "session_confirmed",
        "session_rescheduled",
        "session_cancelled",
        "session_reminder",
        "calendar_event_created",
        "calendar_event_updated",
        "payment_received",
        "system",
        "mention",
        "comment",
        "client_registered",
        "gallery_selection_submitted",
        "client_portal_login",
        "delivery_ready",
        "delivery_reviewed",
        "gallery_selection_over_limit",
      ],
      payment_method: [
        "cash",
        "bank_transfer",
        "zelle",
        "paypal",
        "stripe",
        "azul",
        "cardnet",
        "check",
        "other",
      ],
      payment_status: ["pending", "completed", "failed", "refunded"],
      plan_type: ["free", "basic", "pro", "unlimited"],
      project_status: [
        "inquiry",
        "booked",
        "in_progress",
        "session_done",
        "awaiting_selection",
        "production",
        "prints_sent",
        "editing",
        "delivered",
        "archived",
        "cancelled",
      ],
      studio_role: ["owner", "admin", "staff", "finance", "viewer"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "suspended",
        "cancelled",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed", "cancelled"],
      zip_export_scope: ["gallery", "collection", "selection"],
      zip_export_status: [
        "pending",
        "processing",
        "ready",
        "failed",
        "expired",
      ],
    },
  },
} as const
