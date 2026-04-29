import { createFileRoute } from '@tanstack/react-router'
import { ActivityPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/activity/')({
  component: ActivityPage,
})
