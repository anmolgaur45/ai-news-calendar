import { initTRPC } from '@trpc/server'
import { createClient } from '@/lib/supabase-server'

export async function createContext() {
  const supabase = await createClient()
  return { supabase }
}

export type Context = Awaited<ReturnType<typeof createContext>>

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
