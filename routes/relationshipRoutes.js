const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams is important for nested routes
const { authenticateToken } = require('../middleware/auth');
const relationshipController = require('../controllers/relationshipController');

// All routes in this file are protected
router.use(authenticateToken);

// GET /api/projects/:projectId/relationships
router.get('/', relationshipController.getRelationshipsForElement);

// POST /api/projects/:projectId/relationships
router.post('/', relationshipController.createRelationship);

// PUT /api/projects/:projectId/relationships/:id
router.put('/:id', relationshipController.updateRelationship);

// DELETE /api/projects/:projectId/relationships/:id
router.delete('/:id', relationshipController.deleteRelationship);

module.exports = router;