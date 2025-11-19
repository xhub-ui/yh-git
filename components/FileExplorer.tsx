
import React from 'react';
import { FileContent } from '../types';

interface FileExplorerProps {
  files: FileContent[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onGoUp: () => void;
  onDelete: (file: FileContent) => void;
  onFileClick: (file: FileContent) => void;
  isLoading: boolean;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ 
  files, 
  currentPath, 
  onNavigate, 
  onGoUp, 
  onDelete, 
  onFileClick,
  isLoading 
}) => {
  const getIcon = (type: string, name: string) => {
    if (type === 'dir') return '📁';
    if (name.endsWith('.md')) return '📝';
    if (name.endsWith('.json') || name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.tsx')) return '📜';
    if (name.endsWith('.css') || name.endsWith('.html')) return '🎨';
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')) return '🖼️';
    if (name.endsWith('.zip') || name.endsWith('.rar')) return '📦';
    return '📄';
  };

  return (
    <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 flex flex-col h-full">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/50">
        <div className="flex items-center space-x-2 overflow-hidden">
          <span className="text-slate-400 font-mono text-sm">path:</span>
          <span className="font-mono text-sm text-blue-400 truncate">
             ~/{currentPath}
          </span>
        </div>
        {currentPath !== '' && (
          <button
            onClick={onGoUp}
            className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-white transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
            Up Level
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3">
             <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
             <p className="text-slate-500 text-sm">Fetching contents...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
            <p className="text-sm">This folder is empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {files.map((file) => (
              <div
                key={file.sha}
                className={`group relative p-3 rounded-lg border border-slate-700/50 hover:border-blue-500/50 bg-slate-800/50 hover:bg-slate-700 transition-all flex items-center space-x-3 ${file.type === 'dir' ? 'hover:shadow-md hover:shadow-blue-900/10' : ''}`}
              >
                <div 
                  className="flex-1 flex items-center space-x-3 cursor-pointer overflow-hidden"
                  onClick={() => file.type === 'dir' ? onNavigate(file.path) : onFileClick(file)}
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform duration-200 flex-shrink-0">
                    {getIcon(file.type, file.name)}
                  </span>
                  <div className="overflow-hidden min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {file.type === 'dir' ? 'Directory' : `${(file.size / 1024).toFixed(1)} KB`}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(file);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-all absolute right-2 top-2 sm:relative sm:right-0 sm:top-0 sm:opacity-0 sm:group-hover:opacity-100"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
