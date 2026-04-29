import { createFileRoute } from '@tanstack/react-router'
import { CrmTasksPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/tasks/')({
  component: CrmTasksPage,
})
