import ot from 'ot';
import redisClient from '../config/redis.js';

const { TextOperation } = ot;

// In-memory or Redis-backed state for document versions and pending operations
const documents = {}; // documentId -> { document: String, version: Number, operations: Array }
const collaborators = {}; // documentId -> { socketId: { userId, username, cursor: { index, length } } }

export const initDocument = (documentId, initialText = '') => {
  if (!documents[documentId]) {
    documents[documentId] = {
      document: initialText,
      version: 0,
      operations: [],
    };
  }
  if (!collaborators[documentId]) {
    collaborators[documentId] = {};
  }
  return documents[documentId];
};

export const getDocument = documentId => {
  return documents[documentId];
};

export const applyOperation = (documentId, operationData, version) => {
  const doc = documents[documentId];
  if (!doc) throw new Error('Document not initialized');

  let operation = TextOperation.fromJSON(operationData);

  // Transform against concurrent operations if version is behind
  if (version < doc.version) {
    const concurrentOperations = doc.operations.slice(version);
    for (const concurrentOp of concurrentOperations) {
      operation = TextOperation.transform(operation, concurrentOp)[0];
    }
  }

  // Apply operation to document
  doc.document = operation.apply(doc.document);
  doc.operations.push(operation);
  doc.version++;

  return { operation, version: doc.version };
};

export const updateCursor = (documentId, socketId, cursorData) => {
  if (collaborators[documentId] && collaborators[documentId][socketId]) {
    collaborators[documentId][socketId].cursor = cursorData;
  }
};

export const addCollaborator = (documentId, socketId, user) => {
  if (!collaborators[documentId]) {
    collaborators[documentId] = {};
  }
  collaborators[documentId][socketId] = {
    userId: user._id,
    username: user.username,
    cursor: null,
  };
};

export const removeCollaborator = (documentId, socketId) => {
  if (collaborators[documentId]) {
    delete collaborators[documentId][socketId];
    if (Object.keys(collaborators[documentId]).length === 0) {
      // Optional: Clean up memory if no one is editing
      // delete documents[documentId];
      // delete collaborators[documentId];
    }
  }
};

export const getCollaborators = documentId => {
  if (!collaborators[documentId]) return [];
  return Object.values(collaborators[documentId]);
};

export const handleCollabSocket = (io, socket) => {
  socket.on('collab:join', ({ documentId }) => {
    initDocument(documentId);
    addCollaborator(documentId, socket.id, socket.user);
    socket.join(`record_${documentId}`);

    // Send current doc state
    socket.emit('collab:init', {
      document: documents[documentId].document,
      version: documents[documentId].version,
      collaborators: getCollaborators(documentId),
    });

    // Broadcast to others
    socket.to(`record_${documentId}`).emit('collab:joined', {
      socketId: socket.id,
      user: { userId: socket.user._id, username: socket.user.username },
    });
  });

  socket.on('collab:edit', ({ documentId, operation, version }) => {
    try {
      const result = applyOperation(documentId, operation, version);

      // Broadcast the transformed operation
      socket.to(`record_${documentId}`).emit('collab:update', {
        socketId: socket.id,
        operation: result.operation.toJSON(),
        version: result.version,
      });

      // Acknowledge the operation to the sender
      socket.emit('collab:ack', { version: result.version });
    } catch (error) {
      console.error('OT Error:', error);
      socket.emit('collab:error', { error: 'Conflict resolution failed' });
    }
  });

  socket.on('collab:cursor', ({ documentId, cursor }) => {
    updateCursor(documentId, socket.id, cursor);
    socket.to(`record_${documentId}`).emit('collab:cursorUpdate', {
      socketId: socket.id,
      cursor,
    });
  });

  socket.on('disconnect', () => {
    // Find rooms to remove from
    for (const documentId of Object.keys(collaborators)) {
      if (collaborators[documentId][socket.id]) {
        removeCollaborator(documentId, socket.id);
        io.to(`record_${documentId}`).emit('collab:left', { socketId: socket.id });
      }
    }
  });
};
