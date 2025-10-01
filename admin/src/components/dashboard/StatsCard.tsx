interface StatsCardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon?: React.ComponentType<{ className?: string }>
  iconColor?: string
}

export default function StatsCard({ 
  title, 
  value, 
  change, 
  changeType = 'neutral',
  icon,
  iconColor = 'text-gray-600'
}: StatsCardProps) {
    const getChangeColor = () => {
        switch (changeType) {
            case 'positive':
                return 'text-green-600'
            case 'negative':
                return 'text-red-600'
            default:
                return 'text-gray-600'
        }
    }

    return (
        <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            {icon && <icon className={`h-6 w-6 ${iconColor}`} />}
          </div>
                    <div className="ml-5 w-0 flex-1">
                        <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">
                                {title}
                            </dt>
                            <dd className="text-lg font-medium text-gray-900">
                                {value}
                            </dd>
                        </dl>
                    </div>
                </div>
            </div>
            {change && (
                <div className="bg-gray-50 px-5 py-3">
                    <div className="text-sm">
                        <span className={`font-medium ${getChangeColor()}`}>
                            {change}
                        </span>
                        <span className="text-gray-500 ml-1">from last month</span>
                    </div>
                </div>
            )}
        </div>
    )
}
