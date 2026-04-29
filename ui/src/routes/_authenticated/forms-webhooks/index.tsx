import { createFileRoute } from '@tanstack/react-router'
import { FormsWebhooksPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/forms-webhooks/')({
  component: FormsWebhooksPage,
})
