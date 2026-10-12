import { useEffect, useState } from 'react';
import type { Attachment } from '@shared/types';
import { useTopics } from './realtime';

const TOKEN_KEY = 'pcare_token';
export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: any) {
    super(message);
  }
}

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api' + path, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || '通信エラーが発生しました', res.status, data);
  return data as T;
}

export async function uploadFile(file: File): Promise<Attachment> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${getToken()}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'アップロードに失敗しました', res.status, data);
  return data;
}

/** Fetch `path` and refetch whenever one of `topics` changes on the server. */
export function useApi<T>(path: string | null, topics: string[] = []) {
  const version = useTopics(topics);
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path)
      .then((d) => alive && (setData(d), setError('')))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [path, version, n]);
  return { data, error, reload: () => setN((x) => x + 1), setData };
}
