import { router } from '../trpc'
import { articlesRouter } from './articles'

export const appRouter = router({
  articles: articlesRouter,
})

export type AppRouter = typeof appRouter
