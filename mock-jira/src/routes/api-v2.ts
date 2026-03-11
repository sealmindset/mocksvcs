import { Router, Request, Response } from 'express';
import { getProjects, getProjectByKey } from '../data/generator';

const router = Router();

/**
 * GET /rest/api/2/project/search
 * Search projects with pagination
 */
router.get('/project/search', (req: Request, res: Response) => {
  const startAt = parseInt(req.query.startAt as string) || 0;
  // No cap on maxResults - allow fetching all projects at once if requested
  const maxResults = parseInt(req.query.maxResults as string) || 50;

  console.log(`[API v2] GET /project/search - startAt: ${startAt}, maxResults: ${maxResults}`);

  const result = getProjects(startAt, maxResults);

  res.json({
    startAt,
    maxResults,
    total: result.total,
    isLast: result.isLast,
    values: result.values,
  });
});

/**
 * GET /rest/api/2/project/:projectKey
 * Get project by key
 */
router.get('/project/:projectKey', (req: Request, res: Response) => {
  const { projectKey } = req.params;

  console.log(`[API v2] GET /project/${projectKey}`);

  const project = getProjectByKey(projectKey);

  if (!project) {
    return res.status(404).json({
      errorMessages: [`Project '${projectKey}' does not exist.`],
      errors: {},
    });
  }

  res.json(project);
});

export default router;
