import { createFileRoute } from '@tanstack/react-router'
import { InboxPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/inbox/')({
  component: InboxPage,
})
