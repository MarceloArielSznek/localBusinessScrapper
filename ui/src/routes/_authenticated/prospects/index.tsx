import { createFileRoute } from '@tanstack/react-router'
import { ProspectsPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/prospects/')({
  component: ProspectsPage,
})
