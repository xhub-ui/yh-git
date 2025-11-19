import React, { useState } from 'react';
import { Repository } from '../types';
import { Spinner } from './Spinner';

interface RepoSidebarProps {
  repos: Repository[];
  onSelect: (repo: Repository) => void;
  selectedRepoId: number | null;
  onCreateNew: () => void;
  isLoading: boolean;
}

export const RepoSidebar: React.FC<RepoSidebarProps> = ({
  repos,
  onSelect,
  selectedRepoId,
  onCreateNew,
  isLoading
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRepos = repos.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full md:w-72 bg-slate-900 border-r border-slate-700 flex flex-col h-full">
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
          Repositories
        </h2>
        <button
          onClick={onCreateNew}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors shadow-lg shadow-blue-900/20 flex justify-center items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          New Repository
        </button>
      </div>
      
      <div className="p-2">
        <input
          type="text"
          placeholder="Filter repos..."
          className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-4">No repositories found.</div>
        ) : (
          filteredRepos.map((repo) => (
            <button
              key={repo.id}
              onClick={() => onSelect(repo)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group ${
                selectedRepoId === repo.id
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="truncate font-medium">{repo.name}</span>
              {repo.private && <span className="text-xs text-slate-500 group-hover:text-slate-400">🔒</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
};