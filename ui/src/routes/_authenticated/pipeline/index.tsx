import { createFileRoute } from '@tanstack/react-router'
import { PipelinePage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/pipeline/')({
  component: PipelinePage,
})
