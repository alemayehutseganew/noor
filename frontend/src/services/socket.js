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
        transports: ['polling', 'websocket'],
        withCredentials: true,
        auth: { token },
      })
    } else if (socket.auth?.token !== token) {
      socket.auth = { token }
      socket.disconnect()
      socket.connect()
    }
    return socket
  },
  get: () => socket,
}

export default SocketService
