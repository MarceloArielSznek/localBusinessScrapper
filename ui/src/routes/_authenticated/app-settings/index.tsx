import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/features/leads/pages'

export const Route = createFileRoute('/_authenticated/app-settings/')({
  component: SettingsPage,
})
