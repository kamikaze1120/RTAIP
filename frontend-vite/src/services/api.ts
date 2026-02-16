import axios from 'axios';
import { getBackendBase } from './data';

function computeBaseURL(): string {
  const configured = getBackendBase();
  if (configured) return configured;
  try {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname || '';
      if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8000';
      return 'https://rtaip-backend.onrender.com';
    }
  } catch {}
  return 'https://rtaip-backend.onrender.com';
}

const api = axios.create({ baseURL: computeBaseURL() });

export default api;