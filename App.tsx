
import React, { useState, useEffect, useRef } from 'react';
import { GithubService } from './services/githubService';
import { GithubUser, Repository, ViewState, FileContent, Toast, Branch, Commit } from './types';
import { generateReadme, analyzeFileForCommit, explainCode } from './services/geminiService';
import { RepoSidebar } from './components/RepoSidebar';
import { FileExplorer } from './components/FileExplorer';
import { Spinner } from './components/Spinner';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.AUTH);
  const [token, setToken] = useState('');
  const [user, setUser] = useState<GithubUser | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [files, setFiles] = useState<FileContent[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  
  // Branch State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');

  // Commit State
  const [showCommitsModal, setShowCommitsModal] = useState(false);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);

  // Loading States
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingBranch, setIsLoadingBranch] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);

  // ZIP Extraction Modal State
  const [showZipModal, setShowZipModal] = useState(false);
  const [pendingZipFile, setPendingZipFile] = useState<File | null>(null);

  // Delete Confirmation Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FileContent | null>(null); // null means Delete Repo

  // Editor Modal State
  const [showEditor, setShowEditor] = useState(false);
  const [editorFile, setEditorFile] = useState<FileContent | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  
  // AI Explanation State
  const [isExplaining, setIsExplaining] = useState(false);
  const [aiExplanation, setAiExplanation] = useState('');

  // Service Ref
  const githubService = useRef<GithubService | null>(null);

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // --- Handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const service = new GithubService(token);
      const u = await service.getUser();
      githubService.current = service;
      setUser(u);
      setView(ViewState.DASHBOARD);
      addToast(`Welcome, ${u.name || u.login}!`, 'success');
      loadRepos();
    } catch (error) {
      addToast('Invalid Token or Network Error', 'error');
    }
  };

  const loadRepos = async () => {
    if (!githubService.current) return;
    setIsLoadingRepos(true);
    try {
      const list = await githubService.current.listRepos();
      setRepos(list);
    } catch (error) {
      addToast('Failed to list repositories', 'error');
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleSelectRepo = async (repo: Repository) => {
    setSelectedRepo(repo);
    setCurrentPath('');
    setFiles([]);
    
    if (!githubService.current) return;
    
    // Load Branches
    setIsLoadingBranch(true);
    try {
        const branchList = await githubService.current.listBranches(repo.owner.login, repo.name);
        setBranches(branchList);
        const defaultBranch = branchList.find(b => b.name === repo.default_branch)?.name || branchList[0]?.name || 'main';
        setCurrentBranch(defaultBranch);
        loadFiles(repo.owner.login, repo.name, '', defaultBranch);
    } catch (error) {
        addToast('Failed to load branches', 'error');
        setCurrentBranch(repo.default_branch);
        loadFiles(repo.owner.login, repo.name, '', repo.default_branch);
    } finally {
        setIsLoadingBranch(false);
    }
  };

  const handleBranchChange = (newBranch: string) => {
      setCurrentBranch(newBranch);
      if (selectedRepo) {
          loadFiles(selectedRepo.owner.login, selectedRepo.name, currentPath, newBranch);
      }
  };

  const loadFiles = async (owner: string, repoName: string, path: string, branch: string) => {
    if (!githubService.current) return;
    setIsLoadingFiles(true);
    try {
      const contents = await githubService.current.getContents(owner, repoName, path, branch);
      setFiles(contents);
      setCurrentPath(path);
    } catch (error) {
      // addToast(`Failed to load content for /${path}`, 'error');
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleNavigate = (path: string) => {
    if (!selectedRepo || !user) return;
    loadFiles(selectedRepo.owner.login, selectedRepo.name, path, currentBranch);
  };

  const handleGoUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    const newPath = parts.join('/');
    handleNavigate(newPath);
  };

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubService.current || !newRepoName) return;

    try {
      const repo = await githubService.current.createRepo(newRepoName, newRepoDesc, newRepoPrivate);
      setRepos([repo, ...repos]);
      addToast(`Repository ${repo.name} created!`, 'success');
      setShowCreateModal(false);
      handleSelectRepo(repo);
      
      if (newRepoDesc) {
        setIsGeneratingAI(true);
        const readmeContent = await generateReadme(newRepoName, newRepoDesc, []);
        
        // FIX: Use TextEncoder instead of deprecated unescape()
        const bytes = new TextEncoder().encode(readmeContent);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        await githubService.current.uploadFile(
            user!.login, 
            repo.name, 
            'README.md', 
            base64, 
            'docs: auto-generated README by Gemini',
            repo.default_branch
        );
        addToast('README.md generated by AI', 'success');
        loadFiles(user!.login, repo.name, '', repo.default_branch);
        setIsGeneratingAI(false);
      }
      
    } catch (error) {
      addToast('Failed to create repository', 'error');
    }
  };

  // --- Commits ---

  const handleShowCommits = async () => {
      if (!selectedRepo || !githubService.current) return;
      setShowCommitsModal(true);
      setIsLoadingCommits(true);
      try {
          const data = await githubService.current.getCommits(selectedRepo.owner.login, selectedRepo.name, currentBranch);
          setCommits(data);
      } catch (error) {
          addToast('Failed to fetch commits', 'error');
      } finally {
          setIsLoadingCommits(false);
      }
  };

  // --- File Viewer / Editor ---

  const handleFileClick = async (file: FileContent) => {
      if (file.type === 'dir') {
          handleNavigate(file.path);
          return;
      }

      if (!selectedRepo || !githubService.current) return;

      // Basic extension check
      const isImage = file.name.match(/\.(jpg|jpeg|png|gif|webp|ico|svg)$/i);
      const isText = file.name.match(/\.(txt|md|js|ts|tsx|jsx|html|css|json|py|rb|java|c|cpp|h|go|rs|yaml|yml|toml|env|gitignore)$/i);

      if (isImage) {
          window.open(file.html_url, '_blank');
          return;
      }

      // Open Editor for text files
      if (isText || file.size < 50000) { // Arbitrary size limit for text editing
          setEditorFile(file);
          setShowEditor(true);
          setEditorLoading(true);
          setAiExplanation('');
          try {
              const content = await githubService.current.getFileContent(
                  selectedRepo.owner.login, 
                  selectedRepo.name, 
                  file.path, 
                  currentBranch
              );
              setEditorContent(content);
          } catch (e) {
              addToast('Could not load file content', 'error');
              setShowEditor(false);
          } finally {
              setEditorLoading(false);
          }
      } else {
          window.open(file.html_url, '_blank');
      }
  };

  const handleSaveFile = async () => {
      if (!selectedRepo || !githubService.current || !editorFile || !user) return;
      setEditorSaving(true);
      try {
          // Encode properly for UTF-8 using TextEncoder (avoids deprecated unescape)
          const bytes = new TextEncoder().encode(editorContent);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          await githubService.current.uploadFile(
              user.login,
              selectedRepo.name,
              editorFile.path,
              base64,
              `chore: update ${editorFile.name}`,
              currentBranch
          );
          addToast('File saved successfully', 'success');
          setShowEditor(false);
          // Refresh list to update size/sha if needed, though content is updated
          loadFiles(user.login, selectedRepo.name, currentPath, currentBranch);
      } catch (e) {
          addToast('Failed to save file', 'error');
      } finally {
          setEditorSaving(false);
      }
  };

  const handleExplainCode = async () => {
      if (!editorFile || !editorContent) return;
      setIsExplaining(true);
      setAiExplanation('');
      try {
          const explanation = await explainCode(editorFile.name, editorContent);
          setAiExplanation(explanation);
      } catch (e) {
          addToast('Failed to get AI explanation', 'error');
      } finally {
          setIsExplaining(false);
      }
  };

  // --- Upload Logic ---

  const processZipFile = async (file: File, shouldExtract: boolean) => {
    if (!selectedRepo || !user || !githubService.current) return;
    setIsUploading(true);

    try {
        if (shouldExtract && window.JSZip) {
            const zip = new window.JSZip();
            const zipContent = await zip.loadAsync(file);
            const entries: Array<{path: string, content: Promise<Blob>}> = [];
            
            zipContent.forEach((relativePath: string, zipEntry: any) => {
               if (!zipEntry.dir) {
                 entries.push({
                   path: relativePath,
                   content: zipEntry.async('blob')
                 });
               }
            });

            addToast(`Extracting ${entries.length} files...`, 'info');
            let count = 0;
            for (const entry of entries) {
               const blob = await entry.content;
               const arrayBuffer = await blob.arrayBuffer();
               const bytes = new Uint8Array(arrayBuffer);
               let binary = '';
               for (let i = 0; i < bytes.byteLength; i++) {
                 binary += String.fromCharCode(bytes[i]);
               }
               const base64 = btoa(binary);
               
               const fullPath = currentPath ? `${currentPath}/${entry.path}` : entry.path;
               await githubService.current.uploadFile(
                   user.login,
                   selectedRepo.name,
                   fullPath,
                   base64,
                   `chore: upload extracted ${entry.path}`,
                   currentBranch
               );
               count++;
            }
            addToast(`Extracted & uploaded ${count} files`, 'success');
        } else {
            const reader = new FileReader();
            reader.onload = async () => {
                const content = reader.result as string;
                const base64 = content.split(',')[1];
                const fullPath = currentPath ? `${currentPath}/${file.name}` : file.name;
                await githubService.current!.uploadFile(
                    user.login,
                    selectedRepo.name,
                    fullPath,
                    base64,
                    `chore: upload archive ${file.name}`,
                    currentBranch
                );
                addToast('Archive uploaded successfully', 'success');
                loadFiles(user.login, selectedRepo.name, currentPath, currentBranch);
                setIsUploading(false);
            };
            reader.readAsDataURL(file);
            return; 
        }
    } catch (err) {
        console.error(err);
        addToast('Failed to process archive', 'error');
    } finally {
        if (shouldExtract) {
             loadFiles(user.login, selectedRepo.name, currentPath, currentBranch);
             setIsUploading(false);
        }
    }
  };

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedRepo || !githubService.current || !user) return;
    
    const filesList: File[] = Array.from(e.target.files);
    
    if (filesList.length === 1 && (filesList[0].name.endsWith('.zip') || filesList[0].name.endsWith('.rar'))) {
        setPendingZipFile(filesList[0]);
        setShowZipModal(true);
        e.target.value = ''; 
        return;
    }

    setIsUploading(true);
    let processedCount = 0;

    for (const file of filesList) {
        const reader = new FileReader();
        reader.onload = async () => {
          const content = reader.result as string;
          const base64 = content.split(',')[1];
          
          let commitMsg = `upload ${file.name}`;
          if (file.size < 10000 && (file.name.endsWith('.ts') || file.name.endsWith('.js') || file.name.endsWith('.py'))) {
             // Use base64 decode for analysis prompt, TextDecoder logic in service handles download
             // Here we just need raw text for Gemini
             const textContent = atob(base64); 
             commitMsg = await analyzeFileForCommit(file.name, textContent);
          }

          const filePath = (file as any).webkitRelativePath || file.name;
          const fullPath = currentPath ? `${currentPath}/${filePath}` : filePath;
          
          await githubService.current!.uploadFile(
            user.login,
            selectedRepo.name,
            fullPath,
            base64,
            commitMsg,
            currentBranch
          );
          
          processedCount++;
          if (processedCount === filesList.length) {
             loadFiles(user.login, selectedRepo.name, currentPath, currentBranch);
             setIsUploading(false);
             addToast(`Uploaded ${processedCount} files`, 'success');
          }
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleCreateFolder = async () => {
      const folderName = prompt("Enter folder name:");
      if(!folderName || !selectedRepo || !githubService.current || !user) return;

      const fullPath = currentPath ? `${currentPath}/${folderName}` : folderName;
      setIsUploading(true);
      try {
          await githubService.current.createFolder(
              user.login, 
              selectedRepo.name, 
              fullPath, 
              "chore: create directory",
              currentBranch
          );
          addToast(`Created folder ${folderName}`, 'success');
          loadFiles(user.login, selectedRepo.name, currentPath, currentBranch);
      } catch(e) {
          addToast("Failed to create folder", 'error');
      } finally {
          setIsUploading(false);
      }
  };

  // --- Delete Logic ---

  const promptDelete = (file: FileContent | null) => {
    setItemToDelete(file); 
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedRepo || !user || !githubService.current) return;
    
    setIsDeleting(true);
    try {
        if (itemToDelete) {
            if (itemToDelete.type === 'dir') {
                addToast('Recursively deleting directory...', 'info');
                await githubService.current.deleteFolder(user.login, selectedRepo.name, itemToDelete.path, currentBranch);
            } else {
                await githubService.current.deleteFile(
                    user.login, 
                    selectedRepo.name, 
                    itemToDelete.path, 
                    itemToDelete.sha, 
                    `chore: delete ${itemToDelete.name}`, 
                    currentBranch
                );
            }
            addToast('Deleted successfully', 'success');
            loadFiles(user.login, selectedRepo.name, currentPath, currentBranch);
        } else {
            // Delete Repository (This is branch independent)
            await githubService.current.deleteRepository(user.login, selectedRepo.name);
            addToast('Repository deleted', 'success');
            setSelectedRepo(null);
            setFiles([]);
            setCurrentPath('');
            loadRepos();
        }
        setShowDeleteModal(false);
    } catch (error) {
        console.error(error);
        addToast('Operation failed. Check permissions.', 'error');
    } finally {
        setIsDeleting(false);
    }
  };

  // --- Render ---

  if (view === ViewState.AUTH) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white p-4">
        <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-lg border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 mb-4">
               <span className="text-3xl">🤖</span>
            </div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">GitBot AI</h1>
            <p className="text-slate-400 mt-2 text-sm">Your automated GitHub assistant powered by Gemini.</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">GitHub Personal Access Token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="ghp_xxxxxxxxxxxx"
                required
              />
              <p className="mt-2 text-xs text-slate-500">
                Requires 'repo', 'user', 'delete_repo' scopes.
              </p>
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.02]"
            >
              Connect to GitHub
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[70] space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`pointer-events-auto px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 animate-fade-in-down border ${
            toast.type === 'success' ? 'bg-green-900/90 border-green-700 text-green-100' : 
            toast.type === 'error' ? 'bg-red-900/90 border-red-700 text-red-100' : 
            'bg-blue-900/90 border-blue-700 text-blue-100'
          }`}>
            {toast.type === 'success' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
            {toast.type === 'error' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
            {toast.message}
          </div>
        ))}
      </div>

      {/* Sidebar */}
      <RepoSidebar
        repos={repos}
        selectedRepoId={selectedRepo?.id || null}
        onSelect={handleSelectRepo}
        onCreateNew={() => setShowCreateModal(true)}
        isLoading={isLoadingRepos}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-950">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
           <div className="flex items-center gap-4 overflow-hidden">
             {selectedRepo ? (
               <>
                 <div className="flex flex-col">
                     <h2 className="text-lg font-bold text-white truncate">
                       {selectedRepo.name}
                     </h2>
                     {selectedRepo.private && <span className="text-[10px] text-slate-500 uppercase tracking-wider">Private</span>}
                 </div>
                 
                 <div className="h-6 w-px bg-slate-700 mx-2"></div>

                 {/* Branch Selector */}
                 <div className="relative group">
                     <select 
                       value={currentBranch}
                       onChange={(e) => handleBranchChange(e.target.value)}
                       disabled={isLoadingBranch}
                       className="appearance-none bg-slate-800 hover:bg-slate-700 text-sm text-blue-400 font-medium py-1 px-3 pr-8 rounded border border-slate-700 outline-none cursor-pointer transition-colors"
                     >
                         {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                     </select>
                     <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-500">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                     </div>
                 </div>
                 
                 {/* History Button */}
                 <button 
                    onClick={handleShowCommits}
                    className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-800 transition-colors"
                    title="View Commit History"
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                 </button>
               </>
             ) : (
               <h2 className="text-lg text-slate-500">Select a repository</h2>
             )}
           </div>
           
           <div className="flex items-center gap-4">
             {selectedRepo && (
               <button 
                 onClick={() => promptDelete(null)}
                 className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded border border-red-500/30 transition-colors whitespace-nowrap"
               >
                 Delete Repo
               </button>
             )}
             {user && (
                <div className="flex items-center gap-3 border-l border-slate-800 pl-4">
                   <div className="text-right hidden md:block">
                      <p className="text-sm font-medium text-white">{user.name || user.login}</p>
                   </div>
                   <img src={user.avatar_url} alt="User" className="w-9 h-9 rounded-full border border-slate-700" />
                </div>
             )}
           </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto relative">
          {selectedRepo ? (
            <div className="space-y-4 h-full flex flex-col">
              {/* Toolbar */}
              <div className="flex flex-wrap gap-3 items-center bg-slate-900 p-3 rounded-lg border border-slate-800 shadow-sm">
                {/* Upload File / Zip */}
                <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm cursor-pointer transition-colors shadow-lg shadow-blue-900/20 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                   <input type="file" className="hidden" multiple onChange={handleFileSelection} />
                   {isUploading ? <Spinner size="sm" /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>}
                   Upload Files / Zip
                </label>
                
                {/* Upload Folder */}
                <label className={`flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm cursor-pointer transition-colors shadow-lg shadow-emerald-900/20 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                   <input 
                     type="file" 
                     className="hidden" 
                     {...({ webkitdirectory: "", directory: "" } as any)}
                     onChange={handleFileSelection} 
                   />
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                   Upload Folder
                </label>

                <button onClick={handleCreateFolder} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-sm transition-colors border border-slate-700 hover:border-slate-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
                  New Folder
                </button>

                {isGeneratingAI && (
                  <div className="ml-auto flex items-center gap-2 text-xs text-cyan-400 animate-pulse">
                    <span className="text-lg">✨</span> AI is working...
                  </div>
                )}
              </div>

              {/* File Explorer */}
              <div className="flex-1 min-h-0">
                <FileExplorer 
                  files={files} 
                  currentPath={currentPath} 
                  onNavigate={handleNavigate} 
                  onGoUp={handleGoUp}
                  onDelete={promptDelete}
                  onFileClick={handleFileClick}
                  isLoading={isLoadingFiles}
                />
              </div>
            </div>
          ) : (
             <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
               <div className="w-24 h-24 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 shadow-inner">
                 <svg className="w-12 h-12 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
               </div>
               <div className="text-center">
                   <h3 className="text-xl font-semibold text-slate-400">No Repository Selected</h3>
                   <p className="text-sm mt-2 text-slate-500">Select a repository from the sidebar to manage files.</p>
               </div>
             </div>
          )}
        </div>
      </main>

      {/* Create Repo Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
             <div className="p-6 border-b border-slate-800">
               <h3 className="text-xl font-bold text-white">Create New Repository</h3>
               <p className="text-slate-400 text-sm mt-1">Bot will initialize it with an AI-generated README.</p>
             </div>
             <form onSubmit={handleCreateRepo} className="p-6 space-y-4">
                <div>
                   <label className="block text-sm text-slate-400 mb-1">Repository Name</label>
                   <input 
                     type="text" 
                     required 
                     value={newRepoName}
                     onChange={e => setNewRepoName(e.target.value)}
                     className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                     placeholder="e.g., my-awesome-project"
                   />
                </div>
                <div>
                   <label className="block text-sm text-slate-400 mb-1">Description</label>
                   <textarea 
                     value={newRepoDesc}
                     onChange={e => setNewRepoDesc(e.target.value)}
                     className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                     placeholder="Describe your project..."
                   />
                </div>
                <div className="flex items-center gap-2">
                   <input 
                     type="checkbox" 
                     id="privateRepo"
                     checked={newRepoPrivate}
                     onChange={e => setNewRepoPrivate(e.target.checked)}
                     className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-blue-500" 
                   />
                   <label htmlFor="privateRepo" className="text-sm text-slate-300 select-none">Make Private</label>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors flex items-center gap-2"
                  >
                    Create Repository
                  </button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Zip Extraction Modal */}
      {showZipModal && pendingZipFile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6">
                <div className="text-center mb-6">
                    <div className="mx-auto w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                    </div>
                    <h3 className="text-lg font-bold text-white">Archive Detected</h3>
                    <p className="text-slate-400 text-sm mt-2">
                        You uploaded <strong>{pendingZipFile.name}</strong>. Do you want to extract its contents into the current folder or upload it as a single file?
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => { setShowZipModal(false); processZipFile(pendingZipFile, false); }}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700"
                    >
                        Upload as-is
                    </button>
                    <button 
                        onClick={() => { setShowZipModal(false); processZipFile(pendingZipFile, true); }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg shadow-blue-900/20"
                    >
                        Extract Files
                    </button>
                </div>
                <button 
                    onClick={() => { setShowZipModal(false); setPendingZipFile(null); }}
                    className="w-full mt-3 text-xs text-slate-500 hover:text-slate-300 py-2"
                >
                    Cancel Upload
                </button>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-slate-900 border border-red-900/50 rounded-xl shadow-2xl w-full max-w-md p-6">
                <div className="flex items-center gap-3 mb-4 text-red-500">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    <h3 className="text-lg font-bold">Confirm Deletion</h3>
                </div>
                <p className="text-slate-300 mb-6">
                    Are you sure you want to delete {itemToDelete ? (
                        <span className="text-white font-mono bg-slate-800 px-1 rounded">{itemToDelete.name}</span>
                    ) : (
                        <span className="text-white font-bold">this entire repository</span>
                    )}? 
                    {itemToDelete?.type === 'dir' && <span className="block mt-2 text-red-400 text-sm">Warning: This will recursively delete all files inside the folder.</span>}
                    {!itemToDelete && <span className="block mt-2 text-red-400 text-sm">This action cannot be undone.</span>}
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setShowDeleteModal(false)}
                        className="px-4 py-2 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleConfirmDelete}
                        disabled={isDeleting}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {isDeleting ? <Spinner size="sm" /> : 'Delete Permanently'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Commits Modal */}
      {showCommitsModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[75] p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-white">Commit History ({currentBranch})</h3>
                      <button onClick={() => setShowCommitsModal(false)} className="text-slate-500 hover:text-white">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {isLoadingCommits ? (
                          <div className="flex justify-center p-8"><Spinner /></div>
                      ) : commits.length === 0 ? (
                          <p className="text-center text-slate-500 py-4">No commits found.</p>
                      ) : (
                          commits.map(commit => (
                              <div key={commit.sha} className="p-3 bg-slate-800/50 rounded border border-slate-700/50 hover:border-slate-600 transition-colors">
                                  <div className="flex justify-between items-start gap-2">
                                      <p className="font-medium text-slate-200 text-sm">{commit.commit.message}</p>
                                      <a href={commit.html_url} target="_blank" rel="noreferrer" className="text-xs font-mono text-blue-400 hover:underline flex-shrink-0">
                                          {commit.sha.substring(0, 7)}
                                      </a>
                                  </div>
                                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                                      <span className="font-medium text-slate-400">{commit.commit.author.name}</span>
                                      <span>•</span>
                                      <span>{new Date(commit.commit.author.date).toLocaleDateString()} {new Date(commit.commit.author.date).toLocaleTimeString()}</span>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* File Editor Modal */}
      {showEditor && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-6xl flex flex-col h-[90vh]">
                  <div className="flex items-center justify-between p-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                          <h3 className="font-mono text-blue-400">{editorFile?.name}</h3>
                          <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-800 rounded border border-slate-700">
                            {currentBranch}
                          </span>
                      </div>
                      <div className="flex items-center gap-3">
                          <button 
                            onClick={handleExplainCode}
                            disabled={isExplaining}
                            className="text-xs flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-3 py-1.5 rounded border border-purple-500/30 transition-colors"
                          >
                             {isExplaining ? <Spinner size="sm" /> : '✨ Explain with AI'}
                          </button>
                          <div className="w-px h-4 bg-slate-700 mx-1"></div>
                          <button onClick={() => setShowEditor(false)} className="text-slate-500 hover:text-white">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </button>
                      </div>
                  </div>
                  <div className="flex-1 relative flex overflow-hidden">
                      {editorLoading ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                              <Spinner />
                          </div>
                      ) : (
                          <>
                            <textarea 
                                value={editorContent}
                                onChange={(e) => setEditorContent(e.target.value)}
                                className={`h-full bg-slate-950 text-slate-300 font-mono text-sm p-4 focus:outline-none resize-none border-r border-slate-800 ${aiExplanation ? 'w-2/3' : 'w-full'}`}
                                spellCheck="false"
                            />
                            {aiExplanation && (
                                <div className="w-1/3 bg-slate-900 p-4 overflow-y-auto animate-fade-in">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-purple-400 flex items-center gap-2">
                                            <span>✨</span> AI Explanation
                                        </h4>
                                        <button onClick={() => setAiExplanation('')} className="text-slate-500 hover:text-white">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                        </button>
                                    </div>
                                    <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                                        <pre className="whitespace-pre-wrap font-sans text-sm">{aiExplanation}</pre>
                                    </div>
                                </div>
                            )}
                          </>
                      )}
                  </div>
                  <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-900">
                      <span className="text-xs text-slate-500">Editing on {currentBranch}</span>
                      <div className="flex gap-3">
                        <button 
                            onClick={() => setShowEditor(false)}
                            className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSaveFile}
                            disabled={editorSaving || editorLoading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium flex items-center gap-2 disabled:opacity-50"
                        >
                            {editorSaving ? <Spinner size="sm" /> : 'Commit Changes'}
                        </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
    