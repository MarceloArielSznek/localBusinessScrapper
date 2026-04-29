import { createFileRoute } from '@tanstack/react-router'
import { DemosPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/demos/')({
  component: DemosPage,
})
