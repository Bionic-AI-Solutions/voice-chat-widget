'use client'

import Sidebar from './Sidebar'
import Header from './Header'

interface DashboardLayoutProps {
    children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <div className="flex h-screen bg-gray-100">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100">
                    <div className="container mx-auto px-6 py-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}
