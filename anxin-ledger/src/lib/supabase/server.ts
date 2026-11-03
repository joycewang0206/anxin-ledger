import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Db } from "@/lib/db";
import { supabaseEnv } from "@/lib/env";

/** 伺服器端（Server Component / Server Action / Route Handler）用的 Supabase client，登入狀態存在 cookie。 */
export const createSupabase = cache(async (): Promise<Db> => {
  const { url, anonKey } = supabaseEnv();
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Component 內不能寫 cookie；proxy 會負責更新登入狀態，這裡可以忽略。
        }
      },
    },
  }) as unknown as Db;
});
