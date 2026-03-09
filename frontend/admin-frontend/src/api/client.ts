import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

/** API Gateway の URL（環境変数 VITE_API_BASE_URL で切り替え可能） */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** Axios インスタンス: 認証ヘッダーを自動付与 */
const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.currentUserId) {
    config.headers['X-Mock-User-Id'] = auth.currentUserId;
  }
  return config;
});

export default apiClient;
