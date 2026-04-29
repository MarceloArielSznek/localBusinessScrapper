import {
  Activity,
  BriefcaseBusiness,
  Command,
  Database,
  MapPin,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Menaia',
    email: 'lead-finder@menaia.local',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Menaia',
      logo: Command,
      plan: 'Lead Intelligence',
    },
  ],
  navGroups: [
    {
      title: 'General',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          icon: Sparkles,
        },
        {
          title: 'Inbox',
          url: '/inbox',
          icon: Activity,
        },
        {
          title: 'Leads',
          url: '/leads',
          icon: BriefcaseBusiness,
        },
        {
          title: 'Prospects',
          url: '/prospects',
          icon: MapPin,
        },
        {
          title: 'Pipeline',
          url: '/pipeline',
          icon: BriefcaseBusiness,
        },
        {
          title: 'Demos',
          url: '/demos',
          icon: Sparkles,
        },
        {
          title: 'Tasks',
          url: '/tasks',
          icon: Database,
        },
        {
          title: 'Companies',
          url: '/companies',
          icon: Sparkles,
        },
        {
          title: 'People',
          url: '/people',
          icon: UserRound,
        },
        {
          title: 'Searcher',
          url: '/searcher',
          icon: MapPin,
        },
        {
          title: 'Forms & Webhooks',
          url: '/forms-webhooks',
          icon: Command,
        },
        {
          title: 'Imports / Exports',
          url: '/runs',
          icon: Database,
        },
        {
          title: 'Activity',
          url: '/activity',
          icon: Activity,
        },
        {
          title: 'Settings',
          url: '/app-settings',
          icon: Command,
        },
      ],
    },
  ],
}
