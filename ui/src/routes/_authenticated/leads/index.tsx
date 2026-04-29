import { createFileRoute } from '@tanstack/react-router'
import { LeadsPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/leads/')({
  component: LeadsPage,
})
