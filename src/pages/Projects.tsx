import { FolderIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

const projects = [
  { id: 1, name: 'File Organization', description: 'Automated file system cleanup and organization' },
  { id: 2, name: 'Calendar Integration', description: 'Smart calendar event management' },
  { id: 3, name: 'Voice Control', description: 'Voice commands and responses using Whisper + Eleven Labs' },
  { id: 4, name: 'Document Processing', description: 'PDF to markdown conversion and note taking' },
]

export default function Projects() {
  return (
    <div>
      <div className="border-b border-gray-200 pb-5 sm:flex sm:items-center sm:justify-between">
        <h2 className="text-xl font-cursive leading-6 text-sunflower-dark">Projects</h2>
        <div className="mt-3 sm:ml-4 sm:mt-0">
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-button px-3 py-2 text-sm font-cursive text-sunflower-dark shadow-sm hover:bg-sunflower-accent hover:text-sunflower-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunflower-primary"
          >
            Create new project
          </button>
        </div>
      </div>
      
      <ul role="list" className="divide-y divide-gray-100 mt-6">
        {projects.map((project) => (
          <li key={project.id} className="relative flex justify-between gap-x-6 py-5 hover:bg-gray-50">
            <div className="flex min-w-0 gap-x-4">
              <div className="h-12 w-12 flex-none rounded-lg bg-gray-50 flex items-center justify-center">
                <FolderIcon className="h-6 w-6 text-black" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-auto">
                <p className="text-sm font-semibold leading-6 text-black">
                  <a href="#" className="hover:underline">
                    {project.name}
                  </a>
                </p>
                <p className="mt-1 text-xs leading-5 text-black">{project.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-x-4">
              <ChevronRightIcon className="h-5 w-5 flex-none text-black" aria-hidden="true" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
