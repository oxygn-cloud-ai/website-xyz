// Bundled to assets/botid-client.js with `npm run bundle` (committed; the site has no build step).
// checkLevel must match checkBotId() in api/contact.mjs.
import { initBotId } from 'botid/client/core';

initBotId({
  protect: [{ path: '/api/contact', method: 'POST', advancedOptions: { checkLevel: 'deepAnalysis' } }],
});
