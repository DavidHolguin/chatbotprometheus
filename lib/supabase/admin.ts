import { createClient } from "@supabase/supabase-js";
import "server-only";

// Cliente con service_role — bypassa RLS. Solo usar en server-side.
// NUNCA exponer al cliente ni usar en componentes cliente.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
