import { Server } from 'socket.io';

let ioInstance = null;

export function initRealtime(server) {
  ioInstance = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });
  ioInstance.on('connection', socket => {
    socket.join('inventory');
    socket.on('subscribe', room => socket.join(room));
  });
  return ioInstance;
}

export function emitInventoryUpdate(payload) {
  if (!ioInstance) return;
  ioInstance.to('inventory').emit('inventory:update', payload);
}

export function emitLowStockAlert(payload) {
  if (!ioInstance) return;
  ioInstance.to('inventory').emit('inventory:lowStock', payload);
}


