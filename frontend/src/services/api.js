export const API_BASE_URL = import.meta.env.VITE_API_URL;
export const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_URL;

export const fetchApi = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token')
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  return response
}