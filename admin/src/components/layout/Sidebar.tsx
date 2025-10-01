'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    BarChart3,
    Users,
    FileText,
    Settings,
    MessageSquare,
    Database,
    Activity
} from 'lucide-react'

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
    { name: 'Conversations', href: '/dashboard/conversations', icon: MessageSquare },
    { name: 'Sessions', href: '/dashboard/sessions', icon: Activity },
    { name: 'Users', href: '/dashboard/users', icon: Users },
    { name: 'Files', href: '/dashboard/files', icon: FileText },
    { name: 'Analytics', href: '/dashboard/analytics', icon: Database },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export default function Sidebar() {
    const pathname = usePathname()

    return (
        <div className="flex flex-col w-64 bg-gray-900 text-white">
            <div className="flex items-center h-16 px-4 bg-gray-800">
                <h1 className="text-xl font-bold">Voice Chat Admin</h1>
            </div>
            <nav className="flex-1 px-2 py-4 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${isActive
                                    ? 'bg-gray-800 text-white'
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                }`}
                        >
                            <item.icon
                                className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
                                    }`}
                            />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>
        </div>
    )
}
