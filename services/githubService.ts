
import { GithubUser, Repository, FileContent, Branch, Commit } from '../types';

const BASE_URL = 'https://api.github.com';

export class GithubService {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    const headers = {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `GitHub API Error: ${response.status}`);
    }

    // For 204 No Content (Delete operations)
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  async getUser(): Promise<GithubUser> {
    return this.request<GithubUser>('/user');
  }

  async listRepos(): Promise<Repository[]> {
    return this.request<Repository[]>('/user/repos?sort=updated&per_page=100');
  }

  async listBranches(owner: string, repo: string): Promise<Branch[]> {
    return this.request<Branch[]>(`/repos/${owner}/${repo}/branches`);
  }
  
  async getCommits(owner: string, repo: string, branch: string): Promise<Commit[]> {
    return this.request<Commit[]>(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=20`);
  }

  async createRepo(name: string, description: string, isPrivate: boolean): Promise<Repository> {
    return this.request<Repository>('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        private: isPrivate,
        auto_init: true, 
      }),
    });
  }

  async deleteRepository(owner: string, repo: string): Promise<void> {
    await this.request(`/repos/${owner}/${repo}`, {
      method: 'DELETE'
    });
  }

  async getContents(owner: string, repo: string, path: string = '', ref?: string): Promise<FileContent[]> {
    const refParam = ref ? `?ref=${ref}` : '';
    try {
        const result = await this.request<FileContent[] | FileContent>(`/repos/${owner}/${repo}/contents/${path}${refParam}`);
        if (Array.isArray(result)) {
        return result.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'dir' ? -1 : 1;
        });
        }
        return [result];
    } catch (error: any) {
        // If path not found (empty folder or new repo), return empty array
        if (error.message.includes('404')) return [];
        throw error;
    }
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const refParam = ref ? `?ref=${ref}` : '';
    const data = await this.request<any>(`/repos/${owner}/${repo}/contents/${path}${refParam}`);
    
    if (data.encoding === 'base64') {
        const binaryString = atob(data.content.replace(/\n/g, ''));
        // Use TextDecoder for proper UTF-8 handling instead of deprecated escape()
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    }
    throw new Error('Unsupported file encoding or type');
  }

  async uploadFile(
    owner: string,
    repo: string,
    path: string,
    contentBase64: string,
    message: string,
    branch: string = 'main'
  ): Promise<any> {
    let sha: string | undefined;
    try {
      // Check existing file on the specific branch
      const existingUrl = `${BASE_URL}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const resp = await fetch(existingUrl, {
          headers: { 'Authorization': `token ${this.token}` }
      });
      if (resp.ok) {
          const data = await resp.json();
          sha = data.sha;
      }
    } catch (e) {
      // File doesn't exist
    }

    return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: contentBase64,
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  async createFolder(owner: string, repo: string, path: string, message: string, branch: string): Promise<any> {
    const keepPath = path.endsWith('/') ? `${path}.gitkeep` : `${path}/.gitkeep`;
    return this.uploadFile(owner, repo, keepPath, '', message, branch); 
  }

  async deleteFile(owner: string, repo: string, path: string, sha: string, message: string, branch: string): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({
        message,
        sha,
        branch
      })
    });
  }

  // Recursive folder deletion
  async deleteFolder(owner: string, repo: string, path: string, branch: string): Promise<void> {
      // 1. List all files in path for specific branch
      const contents = await this.getContents(owner, repo, path, branch);
      
      // 2. Delete loop
      for (const item of contents) {
          if (item.type === 'dir') {
              await this.deleteFolder(owner, repo, item.path, branch);
          } else {
              await this.deleteFile(owner, repo, item.path, item.sha, `chore: delete ${item.path}`, branch);
          }
      }
  }
}
