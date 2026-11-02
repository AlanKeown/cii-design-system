
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_name": string,"at": string,"changes": NonNullable<Json>,"id": number,"org_id": string,"record_id": string,"record_name": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_name"?: string,"at"?: string,"changes"?: NonNullable<Json>,"id"?: never,"org_id": string,"record_id": string,"record_name"?: string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_name"?: string,"at"?: string,"changes"?: NonNullable<Json>,"id"?: never,"org_id"?: string,"record_id"?: string,"record_name"?: string,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                },"cases": {
                  Row: {
                    "created_at": string,"date": string,"id": string,"location": string,"member_id": string,"name": string,"notes": string | null,"org_id": string,"priority": Database["public"]['Enums']["case_priority"],"status": Database["public"]['Enums']["case_status"],"type": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date": string,"id": string,"location"?: string,"member_id": string,"name": string,"notes"?: string | null,"org_id": string,"priority": Database["public"]['Enums']["case_priority"],"status": Database["public"]['Enums']["case_status"],"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"id"?: string,"location"?: string,"member_id"?: string,"name"?: string,"notes"?: string | null,"org_id"?: string,"priority"?: Database["public"]['Enums']["case_priority"],"status"?: Database["public"]['Enums']["case_status"],"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cases_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cases_org_id_member_id_fkey"
      columns: ["org_id","member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["org_id","id"]
    }
                  ]
                },"donations": {
                  Row: {
                    "amount": number,"created_at": string,"date": string,"id": string,"location": string,"name": string,"notes": string | null,"org_id": string,"status": Database["public"]['Enums']["donation_status"],"type": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"date": string,"id": string,"location"?: string,"name": string,"notes"?: string | null,"org_id": string,"status": Database["public"]['Enums']["donation_status"],"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"date"?: string,"id"?: string,"location"?: string,"name"?: string,"notes"?: string | null,"org_id"?: string,"status"?: Database["public"]['Enums']["donation_status"],"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "donations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "attendees": number,"created_at": string,"date": string,"id": string,"location": string,"name": string,"notes": string | null,"org_id": string,"status": Database["public"]['Enums']["event_status"],"type": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attendees": number,"created_at"?: string,"date": string,"id": string,"location"?: string,"name": string,"notes"?: string | null,"org_id": string,"status": Database["public"]['Enums']["event_status"],"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "attendees"?: number,"created_at"?: string,"date"?: string,"id"?: string,"location"?: string,"name"?: string,"notes"?: string | null,"org_id"?: string,"status"?: Database["public"]['Enums']["event_status"],"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"org_id": string,"role": Database["public"]['Enums']["app_role"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"org_id": string,"role": Database["public"]['Enums']["app_role"],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"org_id"?: string,"role"?: Database["public"]['Enums']["app_role"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "created_at": string,"date": string,"email": string,"id": string,"location": string,"name": string,"notes": string | null,"org_id": string,"phone": string | null,"program_id": string | null,"status": Database["public"]['Enums']["member_status"],"tags": string | null,"type": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date": string,"email"?: string,"id": string,"location"?: string,"name": string,"notes"?: string | null,"org_id": string,"phone"?: string | null,"program_id"?: string | null,"status": Database["public"]['Enums']["member_status"],"tags"?: string | null,"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"email"?: string,"id"?: string,"location"?: string,"name"?: string,"notes"?: string | null,"org_id"?: string,"phone"?: string | null,"program_id"?: string | null,"status"?: Database["public"]['Enums']["member_status"],"tags"?: string | null,"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_org_id_program_id_fkey"
      columns: ["org_id","program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["org_id","id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "is_owner": boolean,"joined_at": string,"org_id": string,"role": Database["public"]['Enums']["app_role"],"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "is_owner"?: boolean,"joined_at"?: string,"org_id": string,"role": Database["public"]['Enums']["app_role"],"status"?: string,"user_id": string
                  }
                  Update: {
                    "is_owner"?: boolean,"joined_at"?: string,"org_id"?: string,"role"?: Database["public"]['Enums']["app_role"],"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                },"organisations": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"last_active_at": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"last_active_at"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"last_active_at"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"programs": {
                  Row: {
                    "capacity": number,"created_at": string,"date": string,"id": string,"location": string,"name": string,"notes": string | null,"org_id": string,"participants": number,"status": Database["public"]['Enums']["program_status"],"type": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity": number,"created_at"?: string,"date": string,"id": string,"location"?: string,"name": string,"notes"?: string | null,"org_id": string,"participants": number,"status": Database["public"]['Enums']["program_status"],"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "capacity"?: number,"created_at"?: string,"date"?: string,"id"?: string,"location"?: string,"name"?: string,"notes"?: string | null,"org_id"?: string,"participants"?: number,"status"?: Database["public"]['Enums']["program_status"],"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "can_write": boolean,"module": Database["public"]['Enums']["app_module"],"role": Database["public"]['Enums']["app_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "can_write": boolean,"module": Database["public"]['Enums']["app_module"],"role": Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "can_write"?: boolean,"module"?: Database["public"]['Enums']["app_module"],"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    
                  ]
                },"saved_views": {
                  Row: {
                    "created_at": string,"id": string,"module": Database["public"]['Enums']["app_module"],"name": string,"org_id": string,"query": string,"sort": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"module": Database["public"]['Enums']["app_module"],"name": string,"org_id": string,"query"?: string,"sort"?: string,"status"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"module"?: Database["public"]['Enums']["app_module"],"name"?: string,"org_id"?: string,"query"?: string,"sort"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_views_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"create_invitation":
{ Args: { "p_email": string,"p_org": string,"p_role": Database["public"]['Enums']["app_role"] }; Returns: string
                           },
"deactivate_member":
{ Args: { "p_org": string,"p_user": string }; Returns: undefined
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"ensure_workspace":
{ Args: { "p_display_name"?: string,"p_preferred_org"?: string }; Returns: {
              "created": boolean,"org_id": string
            }[]
                           },
"keepalive":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"list_org_users":
{ Args: { "p_org": string }; Returns: {
              "date": string,"email": string,"id": string,"invitation_id": string,"is_owner": boolean,"name": string,"role": Database["public"]['Enums']["app_role"],"status": string,"user_id": string
            }[]
                           },
"report_rows":
{ Args: { "p_from"?: string,"p_module": Database["public"]['Enums']["app_module"],"p_org": string,"p_to"?: string }; Returns: Json
                           },
"seed_demo_workspace":
{ Args: { "p_org": string,"p_payload": Json }; Returns: undefined
                           },
"set_member_role":
{ Args: { "p_org": string,"p_role": Database["public"]['Enums']["app_role"],"p_user": string }; Returns: undefined
                           },
"set_my_demo_role":
{ Args: { "p_org": string,"p_role": Database["public"]['Enums']["app_role"] }; Returns: undefined
                           }
          }
          Enums: {
            "app_module": "Dashboard"|"Members"|"Programs"|"Events"|"Donations"|"Cases"|"Reports"|"Administration","app_role": "Admin"|"Staff"|"Volunteer Coordinator"|"Donations Manager"|"Case Worker"|"Board Member","case_priority": "Normal"|"High"|"Urgent","case_status": "Open"|"In progress"|"Closed"|"Archived","donation_status": "Needs receipt"|"Acknowledged"|"Archived","event_status": "Upcoming"|"Completed"|"Cancelled"|"Archived","member_status": "Active"|"Pending"|"Inactive"|"Archived","program_status": "Active"|"Pending"|"Inactive"|"Archived"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_module": ["Dashboard", "Members", "Programs", "Events", "Donations", "Cases", "Reports", "Administration"],"app_role": ["Admin", "Staff", "Volunteer Coordinator", "Donations Manager", "Case Worker", "Board Member"],"case_priority": ["Normal", "High", "Urgent"],"case_status": ["Open", "In progress", "Closed", "Archived"],"donation_status": ["Needs receipt", "Acknowledged", "Archived"],"event_status": ["Upcoming", "Completed", "Cancelled", "Archived"],"member_status": ["Active", "Pending", "Inactive", "Archived"],"program_status": ["Active", "Pending", "Inactive", "Archived"]
          }
        }
} as const
