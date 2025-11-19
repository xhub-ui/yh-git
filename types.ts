
export interface GithubUser {
  login: string;
  avatar_url: string;
  name: string;
  html_url: string;
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface Commit {
  sha: string;
  commit: {
    author: {
      name: string;
      date: string;
    };
    message: string;
  };
  html_url: string;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  updated_at: string;
  language: string;
  owner: GithubUser;
}

export interface FileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  type: 'file' | 'dir';
  download_url: string | null;
}

export enum ViewState {
  AUTH = 'AUTH',
  DASHBOARD = 'DASHBOARD',
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

// JSZip global type definition hack for CDN usage
declare global {
  interface Window {
    JSZip: any;
  }
}