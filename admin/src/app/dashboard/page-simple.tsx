'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import StatsCard from '@/components/dashboard/StatsCard'
import { MessageSquare, Users, Clock, DollarSign } from 'lucide-react'

export default function DashboardPage() {
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        totalConversations: 0,
        activeConversations: 0,
        averageDuration: 0,
        totalCost: 0
    })

    useEffect(() => {
        // Simulate loading analytics data
        const loadData = async () => {
            setLoading(true)
            // Mock data for now
            setTimeout(() => {
                setStats({
                    totalConversations: 1234,
                    activeConversations: 89,
                    averageDuration: 4.2,
                    totalCost: 234.56
                })
                setLoading(false)
            }, 1000)
        }
        loadData()
    }, [])

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
                    <p className="text-gray-600">Monitor your voice chat widget performance and usage</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        title="Total Conversations"
                        value={stats.totalConversations.toLocaleString()}
                        change="+12%"
                        changeType="positive"
                        icon={MessageSquare}
                        iconColor="text-blue-600"
                    />
                    <StatsCard
                        title="Active Conversations"
                        value={stats.activeConversations.toLocaleString()}
                        change="+5%"
                        changeType="positive"
                        icon={Users}
                        iconColor="text-green-600"
                    />
                    <StatsCard
                        title="Avg. Duration"
                        value={`${stats.averageDuration.toFixed(1)} min`}
                        change="-2%"
                        changeType="negative"
                        icon={Clock}
                        iconColor="text-yellow-600"
                    />
                    <StatsCard
                        title="Total Cost"
                        value={`$${stats.totalCost.toFixed(2)}`}
                        change="+8%"
                        changeType="positive"
                        icon={DollarSign}
                        iconColor="text-red-600"
                    />
                </div>

                {/* Placeholder for charts */}
                <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                        Analytics Charts
                    </h3>
                    <p className="text-gray-600">
                        Interactive charts and detailed analytics will be available here.
                        The full analytics implementation is ready and can be enabled once build issues are resolved.
                    </p>
                </div>

                {/* Recent Activity */}
                <div className="bg-white shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                            Recent Activity
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between py-2 border-b border-gray-200">
                                <div className="flex items-center">
                                    <div className="flex-shrink-0">
                                        <MessageSquare className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm font-medium text-gray-900">
                                            New conversation started
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            officer@example.com • 2 minutes ago
                                        </p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Active
                                </span>
                            </div>

                            <div className="flex items-center justify-between py-2 border-b border-gray-200">
                                <div className="flex items-center">
                                    <div className="flex-shrink-0">
                                        <Users className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm font-medium text-gray-900">
                                            User registered
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            newuser@example.com • 15 minutes ago
                                        </p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    New
                                </span>
                            </div>

                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center">
                                    <div className="flex-shrink-0">
                                        <DollarSign className="h-5 w-5 text-red-600" />
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm font-medium text-gray-900">
                                            Monthly cost updated
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            $234.56 total • 1 hour ago
                                        </p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    Updated
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
