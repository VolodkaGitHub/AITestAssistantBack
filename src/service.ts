import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

import accountLinkingStatus from './api/account-linking/status';

import acceptInvitation from './api/accounts/accept-invitation';
import accessHistory from './api/accounts/access-history';
import createInvitation from './api/accounts/invite';
import fetchLinkedAccounts from './api/accounts/linked';
import managePermissions from './api/accounts/manage-permissions';
import sharedData from './api/accounts/shared-data';
import unlinkAccount from './api/accounts/unlink';
import validateAccess from './api/accounts/validate-access';

import validate from './api/address/validate';

import dashboard from './api/admin/dashboard';
import databaseStatus from './api/admin/database-status';
import generateSdcoEmbeddings from './api/admin/generate-sdco-embeddings';
import metrics from './api/admin/metrics';
import performanceMetrics from './api/admin/performance-metrics';
import performanceStats from './api/admin/performance-stats';
import sessions from './api/admin/sessions';
import stats from './api/admin/stats';
import tokenUsage from './api/admin/token-usage';

import checkAnswer from './api/chat/check-answer';
import detectAnswer from './api/chat/detect-answer';
import extractAnswer from './api/chat/extract-answer';
import extractMemory from './api/chat/extract-memory';
import general from './api/chat/general';
import generate from './api/chat/generate';
import getContext from './api/chat/get-context';

import initDb from './api/conditions/init-db';
import list from './api/conditions/list';
import populateFullDatabase from './api/conditions/populate-full-database';
import search from './api/conditions/search';
import sync from './api/conditions/sync';
import user from './api/conditions/user';

import getSessionCost from './api/cost/get-session-cost';

import populate from './api/database/populate';

import fallbackSession from './api/diagnostic/fallback-session';
import getNextQuestion from './api/diagnostic/get-next-question';
import getNextUnansweredQuestion from './api/diagnostic/get-next-unanswered-question';
import submitAnswer from './api/diagnostic/submit-answer';

import automaticContext from './api/health/automatic-context';
import context from './api/health/context';
import dailyScores from './api/health/daily-scores';
import initialize from './api/health/initialize';
import labResults from './api/health/lab-results';
import medications from './api/health/medications';
import timeline from './api/health/timeline';
import vitals from './api/health/vitals';

import overview from './api/health-check/overview';

import index from './api/health-timeline/index';
import save from './api/health-timeline/save';

import connectToken from './api/human-api/connect-token';
import labResultsHuman from './api/human-api/lab-results';
import testConnection from './api/human-api/test-connection';

import detect from './api/intent/detect';

import labContext from './api/lab-results/context';
import labTestConnection from './api/lab-results/test-connection';

import medicationsLinkedAcc from './api/linked-accounts/medications';
import wearables from './api/linked-accounts/wearables';

import getMedication from './api/medications/get-medication';
import initDatabaseMedications from './api/medications/initialize-database';
import populateCatalog from './api/medications/populate-catalog';
import populateConprehensiveCatalog from './api/medications/populate-comprehensive-catalog';
import populateFullDatabaseMedications from './api/medications/populate-full-database';
import scanPrescription from './api/medications/scan-prescription';
import searchMedications from './api/medications/search';
import userMedications from './api/medications/user-medications';

import deleteMemory from './api/memory/delete';
import listMemory from './api/memory/list';
import searchMemory from './api/memory/search';

import chat from './api/agent/chat';
import goals from './api/agent/goals';
import profile from './api/agent/profile';


export function setupServices(app: Express, baseUrl: string) {

  app.get('/api/account-linking/status', accountLinkingStatus);

  app.post('/api/accounts/accept-invitation', acceptInvitation);
  app.get('/api/accounts/access-history', accessHistory);
  app.post('/api/accounts/invite', createInvitation);
  app.get('/api/accounts/linked', fetchLinkedAccounts);
  app.put('/api/accounts/manage-permissions', managePermissions);
  app.post('/api/accounts/shared-data', sharedData);
  app.delete('/api/accounts/unlink', unlinkAccount);
  app.post('/api/accounts/validate-access', validateAccess);

  app.post('/api/address/validate', validate);

  app.get('/api/admin/dashboard', dashboard);
  app.get('/api/admin/database-status', databaseStatus);
  //app.post('/api/admin/generate-sdco-embeddings', generateSdcoEmbeddings);
  app.get('/api/admin/metrics', metrics);
  app.get('/api/admin/performance-metrics', performanceMetrics);
  app.get('/api/admin/performance-stats', performanceStats);
  app.get('/api/admin/sessions', sessions);
  app.get('/api/admin/stats', stats);
  app.get('/api/admin/token-usage', tokenUsage);
  
  // app.post('/api/agent/chat', chat);
  app.get('/api/agent/goals', goals);
  app.post('/api/agent/goals', goals);
  app.get('/api/agent/profile', profile);
  app.post('/api/agent/profile', profile);

  // app.post('/api/chat/check-answer', checkAnswer);
  // app.post('/api/chat/detect-answer', detectAnswer);
  // app.post('/api/chat/extract-answer', extractAnswer);
  // app.post('/api/chat/extract-memory', extractMemory);
  // app.post('/api/chat/general', general);
  // app.post('/api/chat/generate', generate);
  // app.get('/api/chat/get-context', getContext);

  app.post('/api/conditions/init-db', initDb);
  app.get('/api/conditions/list', list);
  app.post('/api/conditions/populate-full-database', populateFullDatabase);
  app.get('/api/conditions/search', search);
  app.post('/api/conditions/sync', sync);
  app.get('/api/conditions/user', user);
  app.post('/api/conditions/user', user);
  app.delete('/api/conditions/user', user);

  app.get('/api/cost/get-session-cost', getSessionCost);
  app.post('/api/database/populate', populate);

  // app.post('/api/diagnostic/fallback-session', fallbackSession);
  app.put('/api/diagnostic/get-next-question', getNextQuestion);
  app.post('/api/diagnostic/get-next-unanswered-question', getNextUnansweredQuestion);
  app.post('/api/diagnostic/submit-answer', submitAnswer);

  app.post('/api/health/automatic-context', automaticContext);
  app.post('/api/health/context', context);
  app.get('/api/health/daily-scores', dailyScores);
  app.post('/api/health/initialize', initialize);
  app.get('/api/health/lab-results', labResults);
  app.get('/api/health/medications', medications);
  app.get('/api/health/timeline', timeline);
  app.delete('/api/health/timeline', timeline);
  app.get('/api/health/vitals', vitals);

  app.get('/api/health-check/overview', overview);
  
  app.get('/api/health-timeline/index', index);
  app.delete('/api/health-timeline/index', index);
  app.post('/api/health-timeline/save', save);

  app.post('/api/human-api/connect-token', connectToken);
  app.get('/api/human-api/lab-results', labResultsHuman);
  app.get('/api/human-api/test-connection', testConnection);

  // app.post('/api/intent/detect', detect);

  app.get('/api/lab-results/context', labContext);
  app.get('/api/lab-results/test-connection', labTestConnection);

  // linked-accounts
  // app.post('/api/linked-accounts/medications', medicationsLinkedAcc);
  // app.get('/api/linked-accounts/wearables', wearables);

  app.get('/api/medications/get-medication/:id', getMedication);
  app.post('/api/medications/initialize-database', initDatabaseMedications);
  app.post('/api/medications/populate-catalog', populateCatalog);
  app.post('/api/medications/populate-comprehensive-catalog', populateConprehensiveCatalog);
  app.post('/api/medications/populate-full-database', populateFullDatabaseMedications);
  // app.post('/api/medications/scan-prescription', scanPrescription);
  app.post('/api/medications/search', searchMedications);
  app.post('/api/medications/user-medications', userMedications);

  app.delete('/api/memory/delete', deleteMemory);
  app.get('/api/memory/list', listMemory);
  //app.get('/api/memory/search', searchMemory);
  //app.post('/api/memory/search', searchMemory);

  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'My Express API',
        version: '1.0.0',
        description: 'Auto-generated API docs with JWT support',
      },
      servers: [{ url: baseUrl }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      }
    },
    apis: ['./src/api/**/*.ts'],
  };

  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}