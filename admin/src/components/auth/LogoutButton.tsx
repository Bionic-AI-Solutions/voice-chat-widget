'use client'

import { createClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export default function LogoutButton() {
    const router = useRouter()
    const supabase = createClient()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <button
            onClick={handleLogout}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
        </button>
    )
}
