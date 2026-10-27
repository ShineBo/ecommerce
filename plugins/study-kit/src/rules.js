// Product suitability belongs to this plug-in, not to the core shop or the browser.
// Add a new product's SKU here when it can fulfil a requirement.
const requirements = {
  paper: { label: 'Something to write on', skus: ['NOTE-01', 'PAD-01'] },
  notebook: { label: 'A notebook for your ideas', skus: ['NOTE-01'] },
  writing: { label: 'A pen or pencil', skus: ['PEN-01', 'PENCIL-01'] },
  decoration: { label: 'A little decoration', skus: ['TAPE-01'] },
  organizer: { label: 'A place to keep things tidy', skus: ['TRAY-01', 'POUCH-01'] },
};
const purposes = [
  {
    id: 'exam-preparation',
    name: 'Exam preparation',
    description: 'Paper and a writing tool, ready for your next study session.',
    requirements: ['paper', 'writing'],
  },
  {
    id: 'journaling',
    name: 'Journaling',
    description: 'A notebook, a writing tool, and a little color for your pages.',
    requirements: ['notebook', 'writing', 'decoration'],
  },
  {
    id: 'desk-organization',
    name: 'Desk organization',
    description: 'A writing tool and somewhere to keep your small essentials.',
    requirements: ['writing', 'organizer'],
  },
];
const algorithms = {
  P1: {
    algorithm_id: 'P1',
    algorithm_name: 'Essential checklist',
    algorithm_description: 'One suitable product covers each essential in your kit.',
  },
  P2: {
    algorithm_id: 'P2',
    algorithm_name: 'Backup-ready kit',
    algorithm_description:
      'Counts cart quantities and requires two writing items, including a spare.',
  },
};
export const activeAlgorithm = process.env.STUDY_KIT_ALGORITHM || 'P1';
function algorithmInfo(algorithm) {
  if (!Object.hasOwn(algorithms, algorithm))
    throw new Error('STUDY_KIT_ALGORITHM must be P1 or P2');
  return algorithms[algorithm];
}
// Fail at startup instead of serving an incorrectly configured image.
algorithmInfo(activeAlgorithm);
export function getPluginInfo(algorithm = activeAlgorithm) {
  return {
    id: 'study-kit',
    name: 'Study Kit Checker',
    version: `1.1.0-${algorithm}`,
    ...algorithmInfo(algorithm),
    api_version: 1,
    purposes: purposes.map(({ requirements: _requirements, ...purpose }) => purpose),
  };
}
export class InvalidKitRequest extends Error {}
export function checkKit(request, algorithm = activeAlgorithm) {
  const metadata = algorithmInfo(algorithm);
  const purpose = purposes.find((item) => item.id === request.purpose_id);
  if (!purpose) throw new InvalidKitRequest('Choose a supported kit purpose.');
  if (
    !/^\d+$/.test(String(request.cart_version)) ||
    !Number.isSafeInteger(Number(request.cart_version)) ||
    !Array.isArray(request.cart_items) ||
    request.cart_items.length > 50 ||
    !Array.isArray(request.catalog_items) ||
    request.cart_items.some(
      (item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99,
    ) ||
    new Set(request.cart_items.map((item) => item.product_id)).size !== request.cart_items.length ||
    new Set(request.catalog_items.map((item) => item.product_id)).size !==
      request.catalog_items.length
  )
    throw new InvalidKitRequest('Provide a valid cart snapshot.');
  const activeCatalog = request.catalog_items;
  // Require an active catalog match: an old or invented cart ID cannot satisfy a kit.
  const inCart = new Set(request.cart_items.map((item) => item.product_id));
  const quantities = new Map(request.cart_items.map((item) => [item.product_id, item.quantity]));
  const results = purpose.requirements.map((id) => {
    const rule = requirements[id];
    const suitable = activeCatalog.filter((item) => rule.skus.includes(item.sku));
    const matched = suitable.filter((item) => inCart.has(item.product_id));
    // P1 is a category-presence check; P2 sums units, including different suitable SKUs.
    const minimum = algorithm === 'P2' && id === 'writing' ? 2 : 1;
    const present =
      algorithm === 'P1'
        ? Number(matched.length > 0)
        : matched.reduce((sum, item) => sum + quantities.get(item.product_id), 0);
    const satisfied = present >= minimum;
    return {
      id,
      label: rule.label,
      satisfied,
      minimum_quantity: minimum,
      present_quantity: present,
      matched_product_ids: matched.map((item) => item.product_id),
      suggested_product_ids: satisfied ? [] : suitable.slice(0, 3).map((item) => item.product_id),
    };
  });
  const completed = results.filter((item) => item.satisfied).length;
  return {
    ...metadata,
    purpose_id: purpose.id,
    purpose_name: purpose.name,
    cart_version: String(request.cart_version),
    complete: completed === results.length,
    completed_count: completed,
    required_count: results.length,
    requirements: results,
  };
}
