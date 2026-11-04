'use client';

import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from './api';

export function createSocket(token: string): Socket {
  return io(SERVER_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 6000,
    timeout: 8000,
  });
}

export type { Socket };
