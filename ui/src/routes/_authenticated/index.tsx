import { createFileRoute } from '@tanstack/react-router'
import { CrmDashboardPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/')({
  component: CrmDashboardPage,
})
