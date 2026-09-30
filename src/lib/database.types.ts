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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ajustes: {
        Row: {
          org_id: string
          tolerancia_peso_pct: number
          tolerancia_unidad_pct: number
          umbral_alerta_pct: number
        }
        Insert: {
          org_id: string
          tolerancia_peso_pct?: number
          tolerancia_unidad_pct?: number
          umbral_alerta_pct?: number
        }
        Update: {
          org_id?: string
          tolerancia_peso_pct?: number
          tolerancia_unidad_pct?: number
          umbral_alerta_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      correcciones_ocr: {
        Row: {
          campo: string
          correcto: string | null
          creado_at: string
          detectado: string | null
          id: string
          org_id: string
          proveedor_id: string
        }
        Insert: {
          campo: string
          correcto?: string | null
          creado_at?: string
          detectado?: string | null
          id?: string
          org_id: string
          proveedor_id: string
        }
        Update: {
          campo?: string
          correcto?: string | null
          creado_at?: string
          detectado?: string | null
          id?: string
          org_id?: string
          proveedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "correcciones_ocr_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correcciones_ocr_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      diferencias: {
        Row: {
          creado_at: string
          detalle: string
          estado: string
          id: string
          monto: number | null
          org_id: string
          producto_id: string | null
          recepcion_id: string
          tipo: string
        }
        Insert: {
          creado_at?: string
          detalle: string
          estado?: string
          id: string
          monto?: number | null
          org_id: string
          producto_id?: string | null
          recepcion_id: string
          tipo: string
        }
        Update: {
          creado_at?: string
          detalle?: string
          estado?: string
          id?: string
          monto?: number | null
          org_id?: string
          producto_id?: string | null
          recepcion_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "diferencias_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diferencias_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diferencias_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "recepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      equivalencias: {
        Row: {
          id: string
          org_id: string
          producto_id: string
          proveedor_id: string
          texto_remito: string
        }
        Insert: {
          id?: string
          org_id: string
          producto_id: string
          proveedor_id: string
          texto_remito: string
        }
        Update: {
          id?: string
          org_id?: string
          producto_id?: string
          proveedor_id?: string
          texto_remito?: string
        }
        Relationships: [
          {
            foreignKeyName: "equivalencias_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equivalencias_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equivalencias_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      locales: {
        Row: {
          activo: boolean
          id: string
          nombre: string
          org_id: string
        }
        Insert: {
          activo?: boolean
          id?: string
          nombre: string
          org_id: string
        }
        Update: {
          activo?: boolean
          id?: string
          nombre?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      miembros: {
        Row: {
          locales: string[] | null
          nombre: string
          org_id: string
          rol: string
          user_id: string
        }
        Insert: {
          locales?: string[] | null
          nombre: string
          org_id: string
          rol: string
          user_id: string
        }
        Update: {
          locales?: string[] | null
          nombre?: string
          org_id?: string
          rol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miembros_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      organizaciones: {
        Row: {
          creado_at: string
          id: string
          nombre: string
          plan: string
          tope_lecturas_mes: number
        }
        Insert: {
          creado_at?: string
          id?: string
          nombre: string
          plan?: string
          tope_lecturas_mes?: number
        }
        Update: {
          creado_at?: string
          id?: string
          nombre?: string
          plan?: string
          tope_lecturas_mes?: number
        }
        Relationships: []
      }
      pedido_items: {
        Row: {
          cantidad: number
          cantidad_base: number
          id: string
          org_id: string
          pedido_id: string
          precio_estimado_base: number | null
          presentacion_id: string | null
          producto_id: string
        }
        Insert: {
          cantidad: number
          cantidad_base: number
          id: string
          org_id: string
          pedido_id: string
          precio_estimado_base?: number | null
          presentacion_id?: string | null
          producto_id: string
        }
        Update: {
          cantidad?: number
          cantidad_base?: number
          id?: string
          org_id?: string
          pedido_id?: string
          precio_estimado_base?: number | null
          presentacion_id?: string | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_presentacion_id_fkey"
            columns: ["presentacion_id"]
            isOneToOne: false
            referencedRelation: "presentaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          creado_at: string
          creado_por: string
          enviado_at: string | null
          estado: string
          id: string
          local_id: string
          numero: number
          observaciones: string | null
          org_id: string
          pagado_at: string | null
          proveedor_id: string
          subido_at: string
        }
        Insert: {
          creado_at?: string
          creado_por?: string
          enviado_at?: string | null
          estado?: string
          id: string
          local_id: string
          numero: number
          observaciones?: string | null
          org_id: string
          pagado_at?: string | null
          proveedor_id: string
          subido_at?: string
        }
        Update: {
          creado_at?: string
          creado_por?: string
          enviado_at?: string | null
          estado?: string
          id?: string
          local_id?: string
          numero?: number
          observaciones?: string | null
          org_id?: string
          pagado_at?: string | null
          proveedor_id?: string
          subido_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      precios: {
        Row: {
          fecha: string
          id: string
          org_id: string
          origen: string
          precio_base: number
          producto_id: string
          proveedor_id: string
          recepcion_id: string | null
        }
        Insert: {
          fecha?: string
          id?: string
          org_id: string
          origen?: string
          precio_base: number
          producto_id: string
          proveedor_id: string
          recepcion_id?: string | null
        }
        Update: {
          fecha?: string
          id?: string
          org_id?: string
          origen?: string
          precio_base?: number
          producto_id?: string
          proveedor_id?: string
          recepcion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "recepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      presentaciones: {
        Row: {
          activa: boolean
          aproximada: boolean
          factor_a_base: number
          id: string
          nombre: string
          org_id: string
          producto_id: string
        }
        Insert: {
          activa?: boolean
          aproximada?: boolean
          factor_a_base: number
          id?: string
          nombre: string
          org_id: string
          producto_id: string
        }
        Update: {
          activa?: boolean
          aproximada?: boolean
          factor_a_base?: number
          id?: string
          nombre?: string
          org_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentaciones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentaciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          creado_at: string
          id: string
          nombre: string
          org_id: string
          proveedor_id: string
          umbral_alerta_pct: number | null
          unidad_base_id: string
        }
        Insert: {
          activo?: boolean
          creado_at?: string
          id?: string
          nombre: string
          org_id: string
          proveedor_id: string
          umbral_alerta_pct?: number | null
          unidad_base_id: string
        }
        Update: {
          activo?: boolean
          creado_at?: string
          id?: string
          nombre?: string
          org_id?: string
          proveedor_id?: string
          umbral_alerta_pct?: number | null
          unidad_base_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_unidad_base_id_fkey"
            columns: ["unidad_base_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          creado_at: string
          dias_entrega: number[]
          hora_limite: string | null
          id: string
          nombre: string
          org_id: string
          umbral_alerta_pct: number | null
          whatsapp: string
        }
        Insert: {
          activo?: boolean
          creado_at?: string
          dias_entrega?: number[]
          hora_limite?: string | null
          id?: string
          nombre: string
          org_id: string
          umbral_alerta_pct?: number | null
          whatsapp: string
        }
        Update: {
          activo?: boolean
          creado_at?: string
          dias_entrega?: number[]
          hora_limite?: string | null
          id?: string
          nombre?: string
          org_id?: string
          umbral_alerta_pct?: number | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      recepcion_items: {
        Row: {
          cantidad_base: number | null
          cantidad_pedida_base: number | null
          id: string
          org_id: string
          precio_anterior_base: number | null
          precio_unit_base: number | null
          producto_id: string | null
          recepcion_id: string
          resultado: string
          subtotal: number | null
          texto_remito: string
        }
        Insert: {
          cantidad_base?: number | null
          cantidad_pedida_base?: number | null
          id: string
          org_id: string
          precio_anterior_base?: number | null
          precio_unit_base?: number | null
          producto_id?: string | null
          recepcion_id: string
          resultado: string
          subtotal?: number | null
          texto_remito?: string
        }
        Update: {
          cantidad_base?: number | null
          cantidad_pedida_base?: number | null
          id?: string
          org_id?: string
          precio_anterior_base?: number | null
          precio_unit_base?: number | null
          producto_id?: string | null
          recepcion_id?: string
          resultado?: string
          subtotal?: number | null
          texto_remito?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepcion_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "recepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      recepciones: {
        Row: {
          confirmada: boolean
          fecha_remito: string | null
          foto_path: string | null
          id: string
          lectura_ia: Json | null
          local_id: string
          nro_remito: string | null
          observaciones: string | null
          org_id: string
          origen: string
          pedido_id: string | null
          proveedor_id: string
          recibido_at: string
          recibido_por: string
          subido_at: string
          total_remito: number | null
        }
        Insert: {
          confirmada?: boolean
          fecha_remito?: string | null
          foto_path?: string | null
          id: string
          lectura_ia?: Json | null
          local_id: string
          nro_remito?: string | null
          observaciones?: string | null
          org_id: string
          origen: string
          pedido_id?: string | null
          proveedor_id: string
          recibido_at?: string
          recibido_por?: string
          subido_at?: string
          total_remito?: number | null
        }
        Update: {
          confirmada?: boolean
          fecha_remito?: string | null
          foto_path?: string | null
          id?: string
          lectura_ia?: Json | null
          local_id?: string
          nro_remito?: string | null
          observaciones?: string | null
          org_id?: string
          origen?: string
          pedido_id?: string | null
          proveedor_id?: string
          recibido_at?: string
          recibido_por?: string
          subido_at?: string
          total_remito?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          archivada: boolean
          id: string
          nombre: string
          org_id: string
          tipo: string
        }
        Insert: {
          archivada?: boolean
          id?: string
          nombre: string
          org_id: string
          tipo: string
        }
        Update: {
          archivada?: boolean
          id?: string
          nombre?: string
          org_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_lecturas: {
        Row: {
          cantidad: number
          mes: string
          org_id: string
        }
        Insert: {
          cantidad?: number
          mes: string
          org_id: string
        }
        Update: {
          cantidad?: number
          mes?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uso_lecturas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ultimos_precios: {
        Row: {
          fecha: string | null
          precio_base: number | null
          producto_id: string | null
          proveedor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precios_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      confirmar_recepcion: { Args: { recepcion: Json }; Returns: Json }
      devolver_lectura: {
        Args: { p_mes: string; p_org: string }
        Returns: undefined
      }
      guardar_pedido: { Args: { pedido: Json }; Returns: Json }
      importar_catalogo: { Args: { datos: Json }; Returns: Json }
      reservar_lectura: {
        Args: { p_mes: string; p_org: string }
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
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
