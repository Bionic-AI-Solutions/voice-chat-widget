import DashboardLayout from '@/components/layout/DashboardLayout'
import { MessageSquare, Clock, User, Download } from 'lucide-react'

// Mock data - in real implementation, this would come from Supabase
const conversations = [
    {
        id: '1',
        officerEmail: 'officer1@example.com',
        appName: 'Police App',
        startTime: '2024-01-15T10:30:00Z',
        endTime: '2024-01-15T10:45:00Z',
        duration: 15,
        language: 'en',
        status: 'completed',
        transcript: 'This is a sample conversation transcript...',
        summary: 'Officer discussed traffic violation with citizen',
    },
    {
        id: '2',
        officerEmail: 'officer2@example.com',
        appName: 'Emergency Services',
        startTime: '2024-01-15T11:00:00Z',
        endTime: '2024-01-15T11:20:00Z',
        duration: 20,
        language: 'hi',
        status: 'processing',
        transcript: null,
        summary: null,
    },
    {
        id: '3',
        officerEmail: 'officer3@example.com',
        appName: 'Community Services',
        startTime: '2024-01-15T12:00:00Z',
        endTime: '2024-01-15T12:10:00Z',
        duration: 10,
        language: 'en',
        status: 'completed',
        transcript: 'Another conversation transcript...',
        summary: 'Community service inquiry resolved',
    },
]

export default function ConversationsPage() {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-800'
            case 'processing':
                return 'bg-yellow-100 text-yellow-800'
            case 'failed':
                return 'bg-red-100 text-red-800'
            default:
                return 'bg-gray-100 text-gray-800'
        }
    }

    const formatDuration = (minutes: number) => {
        return `${minutes} min`
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString()
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
                        <p className="text-gray-600">Manage and monitor voice chat conversations</p>
                    </div>
                    <button className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors">
                        Export Data
                    </button>
                </div>

                <div className="bg-white shadow rounded-lg overflow-hidden">
                    <div className="px-4 py-5 sm:p-6">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Officer
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            App
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Duration
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Language
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Date
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {conversations.map((conversation) => (
                                        <tr key={conversation.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <User className="h-4 w-4 text-gray-400 mr-2" />
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {conversation.officerEmail}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {conversation.appName}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <Clock className="h-4 w-4 text-gray-400 mr-2" />
                                                    <span className="text-sm text-gray-900">
                                                        {formatDuration(conversation.duration)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {conversation.language.toUpperCase()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(conversation.status)}`}>
                                                    {conversation.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {formatDate(conversation.startTime)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <div className="flex space-x-2">
                                                    <button className="text-indigo-600 hover:text-indigo-900">
                                                        View
                                                    </button>
                                                    {conversation.status === 'completed' && (
                                                        <button className="text-green-600 hover:text-green-900 flex items-center">
                                                            <Download className="h-4 w-4 mr-1" />
                                                            Download
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
