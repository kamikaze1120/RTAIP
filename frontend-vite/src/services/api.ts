import axios from 'axios';
import { getBackendBase } from './data';

function computeBaseURL(): string {
  const configured = getBackendBase();
  if (configured) return configured;
  try {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname;
      if (/vercel\.app$/.test(h)) return 'https://rtaip-backend.onrender.com';
    }
  } catch {}
  return 'http://localhost:8000';
}

const api = axios.create({ baseURL: computeBaseURL() });

export default api;