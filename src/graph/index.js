import { ApolloServer } from 'apollo-server-express';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { authMiddleware, getUserContext } from '../middleware/auth.js';

export async function setupGraphQL(app) {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      const user = await getUserContext(req);
      return { user };
    },
  });

  await server.start();
  app.use('/graphql', authMiddleware, server.getMiddleware({ path: '/graphql' }));
}