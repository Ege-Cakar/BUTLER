import {
  ChatBubbleLeftRightIcon,
  FolderIcon,
  ClockIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'

const features = [
  {
    name: 'Chat & Vector Database',
    description: 'Access and query your personal knowledge base using natural language.',
    icon: ChatBubbleLeftRightIcon,
  },
  {
    name: 'File System Cleanup',
    description: 'Automatically organize and manage your files based on custom rules.',
    icon: FolderIcon,
  },
  {
    name: 'Calendar Management',
    description: 'Smart calendar event generation and management.',
    icon: CalendarIcon,
  },
  {
    name: 'Task Automation',
    description: 'Automate repetitive tasks and streamline your workflow.',
    icon: ClockIcon,
  },
]

export default function Dashboard() {
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-butler-primary">Your Personal Assistant</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Welcome to BUTLER
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Benevolent Untiring Taskmaster for Language, Execution and Results
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-2">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                  <feature.icon className="h-5 w-5 flex-none text-butler-primary" aria-hidden="true" />
                  {feature.name}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">{feature.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
