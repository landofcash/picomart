import express from 'express';
import { tempoIndexer } from '../tempoSync';
import { sendJson } from '../utils/respond';

const router = express.Router();
router.get('/', (_req, res) => {
  const data = tempoIndexer.status();
  sendJson(res, { success: data.ready, data }, data.ready ? 200 : 503);
});
export default router;
