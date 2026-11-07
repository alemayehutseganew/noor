import { io } from 'socket.io-client'
import { SOCKET_BASE_URL } from './api'

const socketUrl = SOCKET_BASE_URL || (
  import.meta.env.PROD ? 'https://noor.ezonic.dev' : 'http://localhost:3001'
)

let socket = null

const SocketService = {
  connect: (token = localStorage.getItem('token')) => {
    if (!socket) {
      socket = io(socketUrl, {
        autoConnect: false,
        transports: ['polling', 'websocket'],
        withCredentials: true,
        auth: { token: token || null },
      })
      socket.on('connect_error', (error) => {
        if (error.message === 'Unauthorized') {
          socket.disconnect()
          if (localStorage.getItem('token') === socket.auth?.token) {
            localStorage.removeItem('token')
          }
        }
      })
    }

    if (!token) {
      socket.auth = { token: null }
      socket.disconnect()
      return socket
    }

    if (socket.auth?.token !== token) {
      socket.auth = { token }
      socket.disconnect()
    }

    if (!socket.connected) socket.connect()
    return socket
  },
  get: () => socket,
}

export default SocketService
