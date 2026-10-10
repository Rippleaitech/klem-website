import { cleanup, stores } from '../../replay/server.mjs';
export default async (req, context) => {
  console.log('Replay retention cleanup', await cleanup(stores(context)));
  if (context.deploy.context === 'production') console.log('Preview retention cleanup', await cleanup(stores({ deploy: { context: 'deploy-preview' } })));
};
export const config = { schedule: '@hourly' };
