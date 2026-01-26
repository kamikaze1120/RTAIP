import axios from 'axios';
import { getBackendBase } from './data';

const api = axios.create({
    baseURL: getBackendBase() || 'http://localhost:8000',
});

export default api;