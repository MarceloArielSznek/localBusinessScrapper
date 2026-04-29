import { createFileRoute } from '@tanstack/react-router'
import { SearcherPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/searcher/')({
  component: SearcherPage,
})
