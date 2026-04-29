import { createFileRoute } from '@tanstack/react-router'
import { PeoplePage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/people/')({
  component: PeoplePage,
})
