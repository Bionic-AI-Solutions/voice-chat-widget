'use client'

import LogoutButton from '@/components/auth/LogoutButton'
import { createClient } from '@/lib/supabase-client'
import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'

export default function Header() {
    const [user, setUser] = useState<User | null>(null)
    const supabase = createClient()

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)
        }
        getUser()
    }, [supabase.auth])

    return (
        <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="flex items-center justify-between h-16 px-6">
                <div className="flex items-center">
                    <h2 className="text-lg font-semibold text-gray-900">Admin Dashboard</h2>
                </div>
                <div className="flex items-center space-x-4">
                    {user && (
                        <div className="flex items-center space-x-3">
                            <div className="text-sm text-gray-600">
                                Welcome, {user.email}
                            </div>
                            <LogoutButton />
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}
