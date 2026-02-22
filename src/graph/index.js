import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import bodyParser from 'body-parser';
import { typeDefs } from './schema.js';
import { resolvers, createContext } from './resolvers.js';
import { auth, getUserContext } from '../middleware/authMiddleware.js';

export async function setupGraphQL(app) {
  const server = new ApolloServer({ 
    typeDefs, 
    resolvers,
    plugins: [
      // Enable GraphQL Playground in development
      process.env.NODE_ENV !== 'production' && 
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      })
    ].filter(Boolean),
    // Format errors for better debugging
    formatError: (formattedError, error) => {
      // Log the full error for debugging
      console.error('GraphQL Error:', error);
      
      // Return formatted error with appropriate status
      return {
        ...formattedError,
        message: formattedError.message,
        extensions: {
          ...formattedError.extensions,
          code: error.extensions?.code || 'INTERNAL_SERVER_ERROR'
        }
      };
    }
  });
  
  await server.start();

  app.use(
    '/graphql',
    auth,
    bodyParser.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Get authenticated user
        const user = await getUserContext(req);
        
        // Create full context with loaders and additional info
        return await createContext({ req, user });
      },
    })
  );

  // Health check endpoint for GraphQL
  app.get('/graphql/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'GraphQL API'
    });
  });
}
