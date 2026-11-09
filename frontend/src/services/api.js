export const API_BASE_URL = '/api';
export const SOCKET_BASE_URL = '/';

export const fetchApi = async (endpoint, options = {}, retries = 3) => {
  const token = localStorage.getItem('token')
  let response
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch (err) {
    if (retries <= 0) throw err
    console.log(`Retrying fetch to ${endpoint}... (${retries} left)`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    return fetchApi(endpoint, options, retries - 1)
  }

  if (response.status === 503 && retries > 0) {
    console.log(`[API] 503 received. Retrying in 2 seconds... (${retries} left)`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    return fetchApi(endpoint, options, retries - 1)
  }

  return response
}