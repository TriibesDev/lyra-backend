const db = require('../db');

exports.getWebViewData = async (req, res) => {
  const { projectId } = req.params;
  const { focus_ids, depth = 1 } = req.query;

  if (!focus_ids) {
    return res.status(400).json({ error: 'At least one focus element ID is required.' });
  }

  try {
    // Step 1: Fetch project data to get the entity names dictionary
    const projectResult = await db.query('SELECT project_data FROM projects WHERE project_id = $1', [projectId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    const projectData = projectResult.rows[0].project_data;

    const entityMap = new Map();
    (projectData.characters || []).forEach(e => entityMap.set(e.id, { ...e, type: 'character' }));
    (projectData.locations || []).forEach(e => entityMap.set(e.id, { ...e, type: 'location' }));
    (projectData.events || []).forEach(e => entityMap.set(e.id, { ...e, type: 'event' }));
    (projectData.misc_items || projectData.misc || []).forEach(e => entityMap.set(e.id, { ...e, type: 'misc' }));

    // Step 2: Iteratively query the 'relationships' table
    const initialFocusIds = focus_ids.split(',');
    const allEdges = new Map();
    const foundNodeIds = new Set(initialFocusIds);
    let frontier = new Set(initialFocusIds);
    let currentLevel = 0;

    while (currentLevel < parseInt(depth) && frontier.size > 0) {
      const currentIds = Array.from(frontier);
      frontier.clear();

      const { rows } = await db.query(
        `SELECT * FROM relationships WHERE project_id = $1 AND (element_a_id = ANY($2::uuid[]) OR element_b_id = ANY($2::uuid[]))`,
        [projectId, currentIds]
      );
      
      rows.forEach(edge => {
        if (!allEdges.has(edge.relationship_id)) {
          allEdges.set(edge.relationship_id, edge);

          if (!foundNodeIds.has(edge.element_a_id)) {
            foundNodeIds.add(edge.element_a_id);
            frontier.add(edge.element_a_id);
          }
          if (!foundNodeIds.has(edge.element_b_id)) {
            foundNodeIds.add(edge.element_b_id);
            frontier.add(edge.element_b_id);
          }
        }
      });
      currentLevel++;
    }

    // Step 3: Build and send the final JSON
    const nodes = Array.from(foundNodeIds).map(id => {
        const entity = entityMap.get(id);
        return { 
            id: id, 
            label: entity?.name || 'Unknown', 
            group: entity?.type || 'unknown' 
        };
    });

    res.json({
        nodes: nodes,
        edges: Array.from(allEdges.values()).map(e => ({
            from: e.element_a_id,
            to: e.element_b_id,
            label: e.category,
            description: e.description // This is the crucial line
        }))
    });
 
  } catch (err) {
    console.error('Error fetching web view data:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// --- Your other existing controller functions ---
// (No changes needed for these, they already use the correct table)
exports.getRelationshipsForElement = async (req, res) => {
  const { element_id, element_type } = req.query;
  const project_id = req.params.projectId;
  try {
    const { rows } = await db.query(
      `SELECT * FROM relationships 
       WHERE project_id = $1 AND 
             ((element_a_id = $2 AND element_a_type = $3) OR 
              (element_b_id = $2 AND element_b_type = $3))
       ORDER BY created_at DESC`,
      [project_id, element_id, element_type]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching relationships:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createRelationship = async (req, res) => {
  const { 
    element_a_id, element_a_type, element_b_id, element_b_type, 
    category, description, start_chapter_id, end_chapter_id 
  } = req.body;
  const project_id = req.params.projectId;
  try {
    const { rows } = await db.query(
      `INSERT INTO relationships (
        project_id, element_a_id, element_a_type, element_b_id, element_b_type, 
        category, description, start_chapter_id, end_chapter_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        project_id, element_a_id, element_a_type, element_b_id, element_b_type,
        category, description, start_chapter_id, end_chapter_id
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating relationship:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateRelationship = async (req, res) => {
  const { id } = req.params;
  const { category, description, start_chapter_id, end_chapter_id } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE relationships SET 
          category = $1, description = $2, start_chapter_id = $3, end_chapter_id = $4, updated_at = NOW() 
       WHERE relationship_id = $5 RETURNING *`,
      [category, description, start_chapter_id, end_chapter_id, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Relationship not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating relationship:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteRelationship = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM relationships WHERE relationship_id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Relationship not found.' });
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting relationship:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};