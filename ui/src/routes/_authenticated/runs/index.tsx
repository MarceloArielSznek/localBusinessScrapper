import { createFileRoute } from '@tanstack/react-router'
import { RunsPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/runs/')({
  component: RunsPage,
})
