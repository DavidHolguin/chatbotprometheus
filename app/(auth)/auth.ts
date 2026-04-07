import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UserType = "guest" | "regular";

export type AppSession = {
  user: {
    id: string;
    email: string | null;
    type: UserType;
  };
  expires: string;
} | null;

/**
 * Obtiene la sesión del usuario actual via Supabase Auth.
 * Drop-in replacement de auth() de NextAuth — misma forma de retorno.
 */
export async function auth(): Promise<AppSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const isAnonymous = user.is_anonymous ?? false;

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      type: isAnonymous ? "guest" : "regular",
    },
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  };
}

/**
 * Cierra la sesión del usuario.
 * Se llama desde Server Actions o Route Handlers.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
