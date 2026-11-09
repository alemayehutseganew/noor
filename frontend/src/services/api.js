export const API_BASE_URL = import.meta.env.VITE_API_URL;
export const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_URL;

export const fetchApi = async (endpoint, options = {}, retries = 3) => {
  const token = localStorage.getItem('token')
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
    return response
  } catch (err) {
    if (retries <= 0) throw err
    console.log(`Retrying fetch to ${endpoint}... (${retries} left)`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    return fetchApi(endpoint, options, retries - 1)
  }
}