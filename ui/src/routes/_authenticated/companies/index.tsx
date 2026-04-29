import { createFileRoute } from '@tanstack/react-router'
import { CompaniesPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/companies/')({
  component: CompaniesPage,
})
