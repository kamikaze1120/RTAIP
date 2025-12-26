import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000', // Adjust this to your backend URL
});

export default api;